import ConsolePage from "@/components/console/console-page";

// Unified Console — live, prettified logs from both projects, clearly divided:
// Matrix Dashboard (backend stdout/stderr + its own browser console) and Matrix
// Builder (dev-server output + optional app browser console via a bridge).
export default function Page() {
  return <ConsolePage />;
}
