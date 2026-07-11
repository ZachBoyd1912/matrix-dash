/* ------------------------------------------------------------------ *
 * Per-device console bus (P4 parity). The runner forwards its own
 * operational log lines as `log_lines` frames; this keeps a capped ring
 * buffer per device and fans new lines to any open console streams, so a
 * member sees THEIR runner's activity in the dashboard Console. Keyed
 * clone of log-bus; stored on globalThis to survive HMR/restart-in-dev.
 * ------------------------------------------------------------------ */

export interface DeviceLogLine {
  ts: number;
  text: string;
}

const CAP = 1000;
type Sub = (line: DeviceLogLine) => void;

interface DeviceChannel {
  buffer: DeviceLogLine[];
  subs: Set<Sub>;
}
interface Bus {
  channels: Map<string, DeviceChannel>;
}

const KEY = Symbol.for("matrix-dash.runner-console-bus");
function bus(): Bus {
  const g = globalThis as unknown as Record<symbol, Bus | undefined>;
  if (!g[KEY]) g[KEY] = { channels: new Map() };
  return g[KEY]!;
}

function channel(deviceId: string): DeviceChannel {
  const b = bus();
  let ch = b.channels.get(deviceId);
  if (!ch) {
    ch = { buffer: [], subs: new Set() };
    b.channels.set(deviceId, ch);
  }
  return ch;
}

export function pushDeviceLog(deviceId: string, lines: string[]): void {
  const ch = channel(deviceId);
  const now = Date.now();
  for (const raw of lines) {
    const text = String(raw).replace(/\s+$/, "");
    if (!text) continue;
    const line: DeviceLogLine = { ts: now, text };
    ch.buffer.push(line);
    if (ch.buffer.length > CAP) ch.buffer.splice(0, ch.buffer.length - CAP);
    for (const s of ch.subs) {
      try {
        s(line);
      } catch {
        /* a broken subscriber must never break logging */
      }
    }
  }
}

export function snapshotDeviceLog(deviceId: string): DeviceLogLine[] {
  return channel(deviceId).buffer.slice();
}

export function subscribeDeviceLog(deviceId: string, cb: Sub): () => void {
  const ch = channel(deviceId);
  ch.subs.add(cb);
  return () => {
    ch.subs.delete(cb);
  };
}
