import { loadConfig, configPath } from "./config";
import { pairDevice } from "./pair";
import { connectLoop } from "./connect";
import { RUNNER_VERSION } from "./version";

/**
 * Matrix Runner CLI.
 *
 *   matrix-runner pair --url <server> --code <pair-code> [--name <device-name>]
 *   matrix-runner run          # foreground connect loop (default command)
 *   matrix-runner status       # config + version summary
 *
 * CF Access service-token creds come from --cf-id/--cf-secret at pair time or
 * MATRIX_RUNNER_CF_ID / MATRIX_RUNNER_CF_SECRET at runtime.
 */

function log(msg: string): void {
  console.log(`[matrix-runner ${new Date().toISOString()}] ${msg}`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const cmd = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "run";

  if (cmd === "version") {
    console.log(RUNNER_VERSION);
    return;
  }

  if (cmd === "pair") {
    const serverUrl = arg("url");
    const code = arg("code");
    if (!serverUrl || !code) {
      console.error("usage: matrix-runner pair --url <server> --code <pair-code> [--name <name>]");
      process.exit(2);
    }
    const cfg = await pairDevice({
      serverUrl,
      code,
      name: arg("name"),
      cfAccessClientId: arg("cf-id") ?? process.env.MATRIX_RUNNER_CF_ID,
      cfAccessClientSecret: arg("cf-secret") ?? process.env.MATRIX_RUNNER_CF_SECRET,
    });
    log(`paired as "${cfg.deviceName}" (device ${cfg.deviceId})`);
    log(`config written to ${configPath()}`);
    return;
  }

  if (cmd === "status") {
    const cfg = loadConfig();
    console.log(
      JSON.stringify(
        {
          version: RUNNER_VERSION,
          configured: !!cfg,
          serverUrl: cfg?.serverUrl,
          deviceId: cfg?.deviceId,
          deviceName: cfg?.deviceName,
          configPath: configPath(),
        },
        null,
        2
      )
    );
    return;
  }

  if (cmd === "run") {
    const cfg = loadConfig();
    if (!cfg) {
      console.error(
        `Not paired yet (no config at ${configPath()}). Run: matrix-runner pair --url <server> --code <code>`
      );
      process.exit(2);
    }
    log(`Matrix Runner v${RUNNER_VERSION} — device "${cfg.deviceName}" → ${cfg.serverUrl}`);
    await connectLoop({
      cfg,
      log,
      onAuthError: () => {
        log("This device's token was revoked. Re-pair from Settings → Devices.");
        process.exit(3);
      },
    });
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(2);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
