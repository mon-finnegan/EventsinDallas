// Builds dist/index.html: one self-contained page (inline CSS + JS, React from cdnjs).
// Used for shareable hosting without a server; the full app still runs via `next build`.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as esbuild from "esbuild";

const REACT = "18.3.1";

// React 18's UMD build has no jsx-runtime; adapt the automatic runtime to createElement.
const JSX_RUNTIME = `
  var R = window.React;
  function jsx(type, props, key) {
    var p = Object.assign({}, props);
    if (key !== undefined) p.key = key;
    return R.createElement(type, p);
  }
  module.exports = { jsx: jsx, jsxs: jsx, Fragment: R.Fragment };
`;

// Map React imports to the UMD globals loaded from cdnjs.
const reactGlobals = {
  name: "react-globals",
  setup(build) {
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({ path: args.path, namespace: "react-global" }));
    build.onLoad({ filter: /.*/, namespace: "react-global" }, (args) => ({
      contents: args.path.startsWith("react-dom")
        ? "module.exports = window.ReactDOM;"
        : args.path === "react/jsx-runtime"
          ? JSX_RUNTIME
          : "module.exports = window.React;",
      loader: "js",
    }));
  },
};

const js = await esbuild.build({
  entryPoints: ["src/static/main.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [reactGlobals],
  write: false,
  logLevel: "warning",
});

mkdirSync("dist", { recursive: true });
execFileSync("npx", ["@tailwindcss/cli", "-i", "src/app/globals.css", "-o", "dist/app.css", "--minify"], { stdio: "inherit" });
const css = readFileSync("dist/app.css", "utf8");
const script = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const html = `<title>Dallas Family Calendar</title>
<style>${css}</style>
<div id="root" class="flex min-h-full flex-col"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT}/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT}/umd/react-dom.production.min.js"></script>
<script>${script}</script>
`;
writeFileSync("dist/index.html", html);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KB`);
