#!/usr/bin/env node
/**
 * Bundle the Matrix Runner into a single dependency-free CJS file.
 * Output: runner/dist/matrix-runner.cjs — runs on any Node ≥ 20 with zero
 * node_modules (pure built-ins + global fetch). Distribution tarballs pair
 * this with a pinned Node runtime per platform (P1b).
 *
 * Uses the esbuild CLI binary (pnpm's strict layout hides the transitive
 * esbuild package from bare imports, but .bin exposes the binary).
 *
 *   node scripts/build-runner.mjs
 */
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const esbuild = path.join(root, "node_modules/.bin/esbuild");

execFileSync(
  esbuild,
  [
    path.join(root, "runner/src/index.ts"),
    "--bundle",
    "--platform=node",
    "--target=node20",
    "--format=cjs",
    `--alias:@=${root}`,
    // The Agent SDK ships platform-specific runtime binaries that can't be
    // inlined — it's installed in the device's node_modules and required at
    // runtime by agent-job.ts. Everything else bundles.
    "--external:@anthropic-ai/claude-agent-sdk",
    `--outfile=${path.join(root, "runner/dist/matrix-runner.cjs")}`,
    "--banner:js=#!/usr/bin/env node",
    "--log-level=info",
  ],
  { stdio: "inherit" }
);
console.log("built runner/dist/matrix-runner.cjs");
