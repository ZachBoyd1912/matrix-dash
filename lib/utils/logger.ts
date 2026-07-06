/**
 * Tiny zero-dependency ANSI logger for our own API routes.
 * Next.js's own compile lines (✓ Compiled, ○ Compiling) can't be themed —
 * this just makes *our* request + service logs scannable in the dev terminal.
 */

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function stamp(): string {
  return `${C.gray}[${new Date().toTimeString().slice(0, 8)}]${C.reset}`;
}

function statusColor(status: number): string {
  if (status >= 500) return C.red;
  if (status >= 400) return C.yellow;
  if (status >= 300) return C.cyan;
  return C.green;
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return C.cyan;
    case "POST":
      return C.green;
    case "PATCH":
    case "PUT":
      return C.yellow;
    case "DELETE":
      return C.red;
    default:
      return C.magenta;
  }
}

function fmtMs(ms: number): string {
  const v = ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  const color = ms > 1000 ? C.yellow : C.dim;
  return `${color}(${v})${C.reset}`;
}

export const logger = {
  req(method: string, path: string, status: number, ms: number) {
    const m = `${methodColor(method)}${method.padEnd(6)}${C.reset}`;
    const s = `${statusColor(status)}${status}${C.reset}`;
    console.log(
      `${stamp()} ${m} ${C.white}${path}${C.reset} ${C.gray}→${C.reset} ${s} ${fmtMs(ms)}`
    );
  },
  info(msg: string) {
    console.log(`${stamp()} ${C.blue}info${C.reset}  ${msg}`);
  },
  ok(msg: string) {
    console.log(`${stamp()} ${C.green}ok${C.reset}    ${msg}`);
  },
  warn(msg: string) {
    console.warn(`${stamp()} ${C.yellow}warn${C.reset}  ${msg}`);
  },
  error(msg: string, err?: unknown) {
    const detail = err instanceof Error ? `${err.message}` : err ? String(err) : "";
    console.error(
      `${stamp()} ${C.red}error${C.reset} ${msg}${detail ? ` ${C.dim}${detail}${C.reset}` : ""}`
    );
  },
};

type RouteCtx = { params: Promise<Record<string, string>> };
type RouteHandler = (req: Request, ctx: RouteCtx) => Promise<Response> | Response;

/**
 * Wrap a route handler so it logs `METHOD /path → STATUS (ms)` once it resolves.
 * Usage: `export const GET = withLog(async (req) => { ... })`.
 */
export function withLog(handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx: RouteCtx) => {
    const start = performance.now();
    let path = "";
    try {
      path = new URL(req.url).pathname;
    } catch {
      path = req.url;
    }
    try {
      const res = await handler(req, ctx);
      logger.req(req.method, path, res.status, performance.now() - start);
      return res;
    } catch (err) {
      logger.req(req.method, path, 500, performance.now() - start);
      logger.error(`Unhandled error in ${path}`, err);
      throw err;
    }
  };
}
