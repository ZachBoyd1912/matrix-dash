import MatrixBuilderGate from "@/components/matrix-builder/matrix-builder-gate";

// Matrix Builder = a separate app (a customized bolt.new fork: a full-screen,
// in-browser AI IDE) protected by its own Cloudflare Access application. Its
// Access login page can't be framed (hardcoded frame-ancestors policy), so this
// page is a status/launch panel rather than an embed: it checks reachability,
// auto-starts the dev server on demand via /api/matrix-builder/server for local
// use, and hands off via a real top-level navigation (new tab).
export default function MatrixBuilderPage() {
  return <MatrixBuilderGate />;
}
