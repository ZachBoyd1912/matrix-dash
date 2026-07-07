// Next.js calls register() once when the server process boots.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Tee the server's own stdout/stderr into the in-memory log bus so the
    // Console page can show Matrix Dashboard's backend logs. Install BEFORE the
    // daemon so its startup output is captured too.
    await installServerLogTee();

    const { startDaemon } = await import("@/lib/services/daemon");
    try {
      startDaemon();
    } catch (err) {
      console.error("[instrumentation] daemon failed to start:", err);
    }

    const { initWatcher } = await import("@/lib/services/obsidian-sync");
    try {
      initWatcher();
    } catch (err) {
      console.error("[instrumentation] obsidian watcher failed to start:", err);
    }
  }
}

/**
 * Mirror everything written to process.stdout/stderr into the log bus, while
 * still passing it through to the real terminal. Line-buffered (so multi-chunk
 * writes don't split mid-line), ANSI-stripped, and guarded against re-entrancy
 * and HMR double-install.
 */
async function installServerLogTee() {
  const FLAG = Symbol.for("matrix-dash.logbus.tee");
  const g = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (g[FLAG]) return;
  g[FLAG] = true;

  const { pushServerLog } = await import("@/lib/services/log-bus");
  const { stripAnsi } = await import("@/lib/console/types");

  let inTee = false;
  const partial: Record<"stdout" | "stderr", string> = { stdout: "", stderr: "" };

  const wrap = (name: "stdout" | "stderr") => {
    const target = process[name];
    const orig = target.write.bind(target);
    const tapped = (...args: unknown[]): boolean => {
      try {
        if (!inTee) {
          inTee = true;
          const chunk = args[0];
          const str =
            typeof chunk === "string"
              ? chunk
              : chunk instanceof Uint8Array
                ? Buffer.from(chunk).toString("utf8")
                : "";
          if (str) {
            const combined = partial[name] + str;
            const parts = combined.split("\n");
            partial[name] = parts.pop() ?? ""; // trailing fragment (no newline yet)
            for (const p of parts) pushServerLog(name, stripAnsi(p));
            // Flush a very long line that never gets a newline so it isn't lost.
            if (partial[name].length > 8192) {
              pushServerLog(name, stripAnsi(partial[name]));
              partial[name] = "";
            }
          }
          inTee = false;
        }
      } catch {
        inTee = false;
      }
      return (orig as (...a: unknown[]) => boolean)(...args);
    };
    target.write = tapped as typeof target.write;
  };

  wrap("stdout");
  wrap("stderr");
}
