import path from "path";
import os from "os";
import fs from "fs";

export function getDataDir(): string {
  // MATRIX_DATA_DIR overrides the default ~/MatrixDash — used by e2e runs (and
  // available for multi-profile / sandboxed deployments) so tests never touch
  // real data. Relative values resolve against the process cwd.
  const dir = process.env.MATRIX_DATA_DIR
    ? path.resolve(process.env.MATRIX_DATA_DIR)
    : path.join(os.homedir(), "MatrixDash");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataDir(), "matrix.db");
}
