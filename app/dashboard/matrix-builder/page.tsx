import MatrixBuilderGate from "@/components/matrix-builder/matrix-builder-gate";

// Matrix Builder = a separate app (a customized bolt.new fork: a full-screen,
// in-browser AI IDE) that runs locally on its own dev server. This page embeds it
// as-is in a cross-origin-isolated iframe (headers scoped to this route in
// next.config.ts) and auto-starts its dev server on demand via
// /api/matrix-builder/server, so opening the tab "just works".
export default function MatrixBuilderPage() {
  return <MatrixBuilderGate />;
}
