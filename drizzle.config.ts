import { defineConfig } from "drizzle-kit";
import path from "path";
import os from "os";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: path.join(os.homedir(), "MatrixDash", "matrix.db"),
  },
});
