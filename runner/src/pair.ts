import os from "os";
import { saveConfig, type RunnerConfig } from "./config";
import { RUNNER_VERSION } from "./version";
import {
  PROTOCOL_VERSION,
  type PairRequestBody,
  type PairResponseBody,
} from "@/lib/runner/protocol";

/** Exchange a one-time pair code for a device token and persist the config. */
export async function pairDevice(opts: {
  serverUrl: string;
  code: string;
  name?: string;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
}): Promise<RunnerConfig> {
  const body: PairRequestBody = {
    code: opts.code,
    protocolVersion: PROTOCOL_VERSION,
    device: {
      name: opts.name || os.hostname(),
      platform: process.platform,
      arch: process.arch,
      appVersion: RUNNER_VERSION,
    },
  };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.cfAccessClientId && opts.cfAccessClientSecret) {
    headers["CF-Access-Client-Id"] = opts.cfAccessClientId;
    headers["CF-Access-Client-Secret"] = opts.cfAccessClientSecret;
  }
  const res = await fetch(new URL("/api/runner/pair", opts.serverUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Pairing failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as PairResponseBody;
  const cfg: RunnerConfig = {
    serverUrl: opts.serverUrl,
    deviceId: data.deviceId,
    runnerToken: data.runnerToken,
    deviceName: body.device.name,
    cfAccessClientId: opts.cfAccessClientId,
    cfAccessClientSecret: opts.cfAccessClientSecret,
  };
  saveConfig(cfg);
  return cfg;
}
