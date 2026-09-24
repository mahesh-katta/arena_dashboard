#!/usr/bin/env python3
"""Area Drill — serves the app and keeps your progress.

    python3 serve.py            # http://localhost:8000
    python3 serve.py 8080       # a different port

Layout it expects:

    area/
      app/          <- this folder (the git repo: `git pull` updates the UI)
        dist/       <- the built app
        serve.py
      data/         <- questions.json, sets.json, charts/  (set up once)
      progress.json <- written here, outside the repo, so a pull never touches it

Routes:
    /                   the app
    /data/...           the question bank and images
    GET    /api/config    what this install has (are the PDFs here?)
    GET    /api/progress  the whole progress document
    POST   /api/progress  merge in sessions, attempts and flags (idempotent)
    DELETE /api/progress  wipe, or drop one topic / one session

No dependencies. Python 3.8+.
"""
import json, os, sys, tempfile, shutil, threading, posixpath
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

APP   = os.path.dirname(os.path.abspath(__file__))
ROOT  = os.path.dirname(APP)                 # area/
DIST  = os.path.join(APP, 'dist')
DATA  = os.path.join(ROOT, 'data')
STORE = os.path.join(ROOT, 'progress.json')
LOCK  = threading.Lock()
EMPTY = {'version': 1, 'sessions': [], 'attempts': [], 'flags': []}


def read_store():
    try:
        with open(STORE) as f:
            d = json.load(f)
        for k, v in EMPTY.items():
            d.setdefault(k, v if not isinstance(v, list) else [])
        return d
    except (FileNotFoundError, json.JSONDecodeError):
        return {'version': 1, 'sessions': [], 'attempts': [], 'flags': []}


def write_store(doc):
    """Atomic: a crash mid-write must not shred the history."""
    if os.path.exists(STORE):
        shutil.copyfile(STORE, STORE + '.bak')
    fd, tmp = tempfile.mkstemp(dir=ROOT, prefix='.progress-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(doc, f, separators=(',', ':'))
        os.replace(tmp, STORE)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIST, **kw)

    # /data/... lives outside dist, so map it by hand (and never above DATA)
    def translate_path(self, path):
        p = unquote(urlparse(path).path)
        if p.startswith('/data/'):
            rel = posixpath.normpath(p[len('/data/'):]).lstrip('/')
            full = os.path.normpath(os.path.join(DATA, rel))
            if os.path.commonpath([full, DATA]) != DATA:
                return DATA                       # refuse to escape the folder
            return full
        return super().translate_path(path)

    def log_message(self, fmt, *args):
        try:
            msg = fmt % args
        except Exception:
            msg = ' '.join(str(a) for a in args)
        if '404' in msg or '/api/' in msg or 'error' in msg.lower():
            sys.stderr.write('%s   %s\n' % (msg, getattr(self, 'path', '')))

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n) or b'{}')
        except json.JSONDecodeError:
            return {}

    def do_GET(self):
        p = urlparse(self.path).path
        if p == '/api/config':
            return self._json({
                'pdfs': os.path.isdir(os.path.join(DATA, 'guidely-pdfs')),
                'charts': os.path.isdir(os.path.join(DATA, 'charts')),
                'api': True,
            })
        if p == '/api/progress':
            with LOCK:
                return self._json(read_store())
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != '/api/progress':
            return self.send_error(404)
        payload = self._body()
        with LOCK:
            doc = read_store()
            if payload.get('replace'):
                doc = {'version': 1,
                       'sessions': payload.get('sessions') or [],
                       'attempts': payload.get('attempts') or [],
                       'flags': payload.get('flags') or []}
                write_store(doc)
                return self._json({'ok': True, 'replaced': True, 'attempts': len(doc['attempts'])})

            # attempts carry an id, so a retried request cannot double-count
            have = {a.get('id') for a in doc['attempts']}
            added = 0
            for a in payload.get('attempts') or []:
                if a.get('id') and a['id'] in have:
                    continue
                doc['attempts'].append(a)
                have.add(a.get('id'))
                added += 1

            sess = {s.get('sid'): s for s in doc['sessions']}
            for s in payload.get('sessions') or []:
                if s.get('sid'):
                    sess[s['sid']] = {**sess.get(s['sid'], {}), **s}
            doc['sessions'] = list(sess.values())

            if payload.get('flags') is not None:
                doc['flags'] = payload['flags']       # the client owns this list

            write_store(doc)
            return self._json({'ok': True, 'added': added, 'attempts': len(doc['attempts'])})

    def do_DELETE(self):
        u = urlparse(self.path)
        if u.path != '/api/progress':
            return self.send_error(404)
        q = parse_qs(u.query)
        topic = (q.get('topic') or [None])[0]
        sid = (q.get('sid') or [None])[0]
        with LOCK:
            doc = read_store()
            before = len(doc['attempts'])
            if topic:
                doc['attempts'] = [a for a in doc['attempts'] if a.get('topic') != topic]
            elif sid:
                doc['attempts'] = [a for a in doc['attempts'] if a.get('sid') != sid]
                doc['sessions'] = [s for s in doc['sessions'] if s.get('sid') != sid]
            else:
                doc = {'version': 1, 'sessions': [], 'attempts': [], 'flags': []}
            write_store(doc)
            return self._json({'ok': True, 'removed': before - len(doc['attempts']),
                               'attempts': len(doc['attempts'])})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8000
    missing = [f for f in ('questions.json', 'sets.json') if not os.path.exists(os.path.join(DATA, f))]
    if missing:
        print('The question bank is missing: %s' % ', '.join(missing))
        print('Expected in: %s' % DATA)
        print('Copy the data folder in beside this app, then run this again.\n')
    if not os.path.exists(os.path.join(DIST, 'app.js')):
        print('dist/app.js is missing — run:  node build.mjs\n')
    doc = read_store()
    print('Area Drill')
    print('  http://localhost:%d' % port)
    print('  data     : %s' % DATA)
    print('  progress : %s  (%d attempts, %d flagged)'
          % (STORE, len(doc['attempts']), len(doc['flags'])))
    print('\nKeep this window open. Press Ctrl+C to stop.\n')
    try:
        ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
    except KeyboardInterrupt:
        print('\nstopped.')


if __name__ == '__main__':
    main()
