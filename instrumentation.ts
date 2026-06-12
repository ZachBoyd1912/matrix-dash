// Next.js calls register() once when the server process boots.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDaemon } = await import("@/lib/services/daemon");
    try {
      startDaemon();
    } catch (err) {
      console.error("[instrumentation] daemon failed to start:", err);
    }
  }
}
