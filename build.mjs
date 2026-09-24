/* Builds src/ into dist/. The built files are committed, so updating the app on
   another machine is `git pull` and nothing else — no Node, no npm, no build.

     node build.mjs            once
     node build.mjs --watch    while editing
*/
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";

mkdirSync("dist", { recursive: true });
copyFileSync("src/styles.css", "dist/styles.css");

const opts = {
  entryPoints: ["src/main.jsx"],
  bundle: true,
  outfile: "dist/app.js",
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  minify: !process.argv.includes("--watch"),
  sourcemap: false,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log("watching src/ …");
} else {
  await esbuild.build(opts);
  console.log("built dist/app.js + dist/styles.css");
}
