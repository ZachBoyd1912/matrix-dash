import * as vscode from "vscode";

/**
 * Matrix Agent — a webview-based AI sidebar for code-server.
 *
 * Architecture (ai-engineer lens):
 *   webview (media/main.js)  ──postMessage──►  MatrixAgentViewProvider
 *        ▲                                            │
 *        │   text / reasoning / error / done deltas   ▼
 *        └───────────────────────────────────  fetch(dashboardUrl/api/ai/chat)
 *
 * The provider is the only place that touches the network or the workspace.
 * The webview is a dumb renderer that emits intent (`send`, `cancel`, `applyEdit`,
 * `runInTerminal`) and consumes typed deltas. Both sides share the message unions
 * declared below (typescript-pro lens) so the boundary stays exhaustively typed.
 */

// ---------------------------------------------------------------------------
// Wire protocol — the contract the dashboard streams (claude-api lens).
// `POST /api/ai/chat` returns application/x-ndjson: one JSON object per line,
// each `{ type: "text" | "reasoning" | "error", value: string }`.
// ---------------------------------------------------------------------------

type ChatRole = "user" | "assistant" | "system";

interface ChatTurn {
  role: ChatRole;
  content: string;
}

/** A single decoded NDJSON line from the dashboard stream. */
interface StreamDelta {
  type: "text" | "reasoning" | "error";
  value?: string;
}

// ---------------------------------------------------------------------------
// Extension ⇄ webview message unions.
// ---------------------------------------------------------------------------

/** Messages the webview sends *to* the extension host. */
type InboundMessage =
  | { type: "ready" }
  | { type: "send"; text: string }
  | { type: "cancel" }
  | { type: "applyEdit"; path: string; content: string }
  | { type: "runInTerminal"; command: string };

/** Messages the extension host posts *to* the webview. */
type OutboundMessage =
  | { type: "config"; mode: "chat" | "agent" }
  | { type: "userEcho"; text: string }
  | { type: "start" }
  | { type: "text"; value: string }
  | { type: "reasoning"; value: string }
  | { type: "error"; value: string }
  | { type: "done" }
  | { type: "reset" }
  | { type: "info"; value: string };

// ---------------------------------------------------------------------------
// View provider.
// ---------------------------------------------------------------------------

class MatrixAgentViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "matrixAgent.chat";

  private view?: vscode.WebviewView;
  /** Running transcript, mirroring how chat-interface.tsx builds its `convo`. */
  private history: ChatTurn[] = [];
  /** Aborts the in-flight stream when the user cancels or sends again. */
  private inFlight?: AbortController;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    view.webview.html = this.renderHtml(view.webview);

    view.webview.onDidReceiveMessage((message: InboundMessage) => {
      void this.handleMessage(message);
    });
  }

  /** Clears the transcript and the webview view (wired to matrixAgent.newChat). */
  public newChat(): void {
    this.inFlight?.abort();
    this.inFlight = undefined;
    this.history = [];
    this.post({ type: "reset" });
    this.post({ type: "config", mode: this.readMode() });
  }

  private async handleMessage(message: InboundMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        this.post({ type: "config", mode: this.readMode() });
        break;
      case "send":
        await this.streamChat(message.text);
        break;
      case "cancel":
        this.inFlight?.abort();
        this.inFlight = undefined;
        break;
      case "applyEdit":
        await applyEdit(message.path, message.content);
        break;
      case "runInTerminal":
        runInTerminal(message.command);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Streaming (claude-api lens): POST the transcript, read NDJSON line-by-line,
  // and forward text/reasoning/error deltas to the webview as they arrive.
  // -------------------------------------------------------------------------

  private async streamChat(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Cancel any previous stream before starting a new turn.
    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;

    this.history.push({ role: "user", content: trimmed });
    this.post({ type: "userEcho", text: trimmed });
    this.post({ type: "start" });

    const url = this.dashboardEndpoint();
    let assistantText = "";

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: this.history,
          mode: this.readMode(),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        // The route returns a JSON error object for non-stream failures.
        const detail = await res
          .json()
          .then((d: { error?: string }) => d.error)
          .catch(() => undefined);
        throw new Error(detail || `HTTP ${res.status} from ${url}`);
      }

      assistantText = await this.consumeStream(res.body, controller.signal);

      // Persist the assistant turn so multi-turn context is preserved, matching
      // the dashboard client which appends the streamed reply to its history.
      if (assistantText.trim()) {
        this.history.push({ role: "assistant", content: assistantText });
      }
      this.post({ type: "done" });
    } catch (err) {
      if (controller.signal.aborted) {
        // User-cancelled: drop the unanswered user turn so retries stay clean.
        this.history.pop();
        this.post({ type: "done" });
        return;
      }
      const messageText = err instanceof Error ? err.message : String(err);
      this.post({ type: "error", value: messageText });
      this.post({ type: "done" });
      // Roll back the user turn so a failed request doesn't poison history.
      this.history.pop();
    } finally {
      if (this.inFlight === controller) this.inFlight = undefined;
    }
  }

  /**
   * Reads the NDJSON body to completion, posting deltas as they decode.
   * Returns the accumulated assistant text. Mirrors the line-buffered parser in
   * components/chat/chat-interface.tsx: split on "\n", keep the trailing partial.
   */
  private async consumeStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal
  ): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";

    const handleLine = (raw: string): void => {
      const line = raw.trim();
      if (!line) return;
      let delta: StreamDelta;
      try {
        delta = JSON.parse(line) as StreamDelta;
      } catch {
        // Backward-compat: a plain-text streamer → treat the chunk as reply text.
        assistantText += raw;
        this.post({ type: "text", value: raw });
        return;
      }
      if (delta.type === "text") {
        assistantText += delta.value ?? "";
        this.post({ type: "text", value: delta.value ?? "" });
      } else if (delta.type === "reasoning") {
        this.post({ type: "reasoning", value: delta.value ?? "" });
      } else if (delta.type === "error") {
        this.post({ type: "error", value: delta.value ?? "Stream error" });
      }
    };

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // retain the trailing partial line
        for (const l of lines) handleLine(l);
      }
      if (buffer) handleLine(buffer);
    } finally {
      // Release the lock; if we bailed early, also stop the upstream body.
      if (signal.aborted) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }

    return assistantText;
  }

  // -------------------------------------------------------------------------
  // Config + endpoint helpers.
  // -------------------------------------------------------------------------

  private config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("matrixAgent");
  }

  private readMode(): "chat" | "agent" {
    return this.config().get<"chat" | "agent">("mode", "agent");
  }

  private dashboardEndpoint(): string {
    const base = this.config()
      .get<string>("dashboardUrl", "http://127.0.0.1:3000")
      .replace(/\/+$/, "");
    return `${base}/api/ai/chat`;
  }

  private post(message: OutboundMessage): void {
    void this.view?.webview.postMessage(message);
  }

  // -------------------------------------------------------------------------
  // HTML shell with a strict CSP and nonce-gated script.
  // -------------------------------------------------------------------------

  private renderHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.css")
    );
    const nonce = makeNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Matrix Agent</title>
</head>
<body>
  <div id="app">
    <div id="messages" role="log" aria-live="polite"></div>
    <form id="composer">
      <textarea id="input" rows="1" placeholder="Ask the agent…" aria-label="Message"></textarea>
      <button id="send" type="submit" title="Send">Send</button>
      <button id="stop" type="button" title="Stop" hidden>Stop</button>
    </form>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

// ---------------------------------------------------------------------------
// Host-backed helper commands the agent can trigger via webview buttons.
// ---------------------------------------------------------------------------

/**
 * Writes `content` to `path` (relative to the first workspace folder, or absolute),
 * but shows a diff against the existing file first so the change is reviewable.
 * Creates parent files via WorkspaceEdit when the target is new.
 */
async function applyEdit(path: string, content: string): Promise<void> {
  const target = resolveWorkspaceUri(path);
  if (!target) {
    void vscode.window.showErrorMessage(
      "Matrix Agent: open a folder before applying edits."
    );
    return;
  }

  const encoder = new TextEncoder();
  const proposed = encoder.encode(content);

  // Read the current version (empty if the file does not exist yet) and stage the
  // proposed version in an in-memory document so vscode.diff has something to show.
  let original = new Uint8Array();
  let exists = true;
  try {
    original = await vscode.workspace.fs.readFile(target);
  } catch {
    exists = false;
  }

  const proposedDoc = await vscode.workspace.openTextDocument({
    content,
    language: guessLanguageId(target),
  });

  const leftTitle = exists ? "Current" : "(new file)";
  await vscode.commands.executeCommand(
    "vscode.diff",
    target,
    proposedDoc.uri,
    `Matrix Agent: ${vscode.workspace.asRelativePath(target)} ↔ proposed (${leftTitle})`
  );

  const choice = await vscode.window.showInformationMessage(
    `Apply Matrix Agent's changes to ${vscode.workspace.asRelativePath(target)}?`,
    { modal: true },
    "Apply"
  );
  if (choice !== "Apply") return;

  if (!exists) {
    // Ensure the file (and its parent dirs) exist before writing.
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(target, { ignoreIfExists: true });
    await vscode.workspace.applyEdit(edit);
  }
  await vscode.workspace.fs.writeFile(target, proposed);

  const opened = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(opened);
  void vscode.window.showInformationMessage(
    `Matrix Agent: updated ${vscode.workspace.asRelativePath(target)}.`
  );
}

/** Opens (or reuses) a dedicated terminal and runs the command in it. */
function runInTerminal(command: string): void {
  const name = "Matrix Agent";
  const existing = vscode.window.terminals.find((t) => t.name === name);
  const terminal = existing ?? vscode.window.createTerminal({ name });
  terminal.show(true);
  terminal.sendText(command, true);
}

// ---------------------------------------------------------------------------
// Small utilities.
// ---------------------------------------------------------------------------

/** Resolves a user/agent-supplied path to a workspace-anchored or absolute URI. */
function resolveWorkspaceUri(path: string): vscode.Uri | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (/^(?:[a-zA-Z]:[\\/]|\/)/.test(path)) {
    // Already absolute (POSIX or Windows drive path).
    return vscode.Uri.file(path);
  }
  if (!folders || folders.length === 0) return undefined;
  return vscode.Uri.joinPath(folders[0].uri, path);
}

/** Best-effort language id from a file extension for nicer diff syntax coloring. */
function guessLanguageId(uri: vscode.Uri): string {
  const ext = uri.path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    py: "python",
    go: "go",
    rs: "rust",
    sh: "shellscript",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? "plaintext";
}

/** CSP nonce for the inline-loaded webview script. */
function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

// ---------------------------------------------------------------------------
// Activation.
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MatrixAgentViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MatrixAgentViewProvider.viewId,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand("matrixAgent.newChat", () => provider.newChat())
  );
}

export function deactivate(): void {
  // No global resources to release; per-stream AbortControllers are scoped to the
  // provider and torn down when the extension host disposes the webview.
}
