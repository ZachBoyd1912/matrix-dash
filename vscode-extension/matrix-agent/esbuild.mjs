// Bundles the extension host entry point into a single CommonJS file that
// code-server's Node extension host can require directly. `vscode` is provided
// by the host at runtime, so it is always marked external.
import { build } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,
  // The VS Code API module is injected by the extension host, never bundled.
  external: ["vscode"],
  logLevel: "info",
};

if (watch) {
  const { context } = await import("esbuild");
  const ctx = await context(options);
  await ctx.watch();
  console.log("[matrix-agent] watching for changes…");
} else {
  await build(options);
}
