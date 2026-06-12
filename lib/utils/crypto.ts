import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDataDir } from "./db-path";

// AES-256-GCM with a machine-local key stored next to the database.
// Keys at rest are never readable without ~/MatrixDash/.key.

function getKey(): Buffer {
  const keyPath = path.join(getDataDir(), ".key");
  if (!fs.existsSync(keyPath)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
    return key;
  }
  return Buffer.from(fs.readFileSync(keyPath, "utf-8").trim(), "hex");
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
}
