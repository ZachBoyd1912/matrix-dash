import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

// Every test run gets its own throwaway data dir so lib/db/client.ts and
// lib/utils/crypto.ts never touch the real ~/MatrixDash on this machine.
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-dash-test-"));

vi.mock("@/lib/utils/db-path", () => ({
  getDataDir: () => testDataDir,
  getDbPath: () => path.join(testDataDir, "matrix.db"),
}));

// jsdom doesn't implement matchMedia; next-themes calls it on mount to read
// the OS color-scheme preference.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
