import path from "path";
import os from "os";
import fs from "fs";

export function getDataDir(): string {
  const dir = path.join(os.homedir(), "MatrixDash");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataDir(), "matrix.db");
}
