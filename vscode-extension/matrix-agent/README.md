# Matrix Agent

A VS Code / code-server extension that adds an AI agent sidebar to the editor. It
talks to your running [Matrix Dash](https://github.com/ZachBoyd1912/matrix-dash) dashboard: every message is POSTed to
`<dashboardUrl>/api/ai/chat` and the NDJSON stream (`{type:"text"|"reasoning"|"error"}`)
is rendered live in a webview, mirroring the dashboard's own chat client.

The agent can also act on your workspace through two host-backed helpers:

- **Apply edit** — writes content to a file, showing a diff against the current
  version first (`vscode.diff`) so nothing changes without review.
- **Run in terminal** — opens an integrated terminal and runs a command.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `matrixAgent.dashboardUrl` | `http://127.0.0.1:3000` | Base URL of the dashboard. |
| `matrixAgent.mode` | `agent` | `chat` (no tools) or `agent` (tool-using). |

## Build & package

This is a self-contained subproject with its own `package.json`. Build it on a
machine that can run npm (not the constrained authoring machine):

```bash
npm install        # installs esbuild, @vscode/vsce, @types/vscode, typescript
npm run build      # esbuild → dist/extension.js (CommonJS, node18, vscode external)
npm run package    # vsce → matrix-agent-<version>.vsix
```

`startCodeServer` auto-installs the built `.vsix` into code-server if one is present
in this directory, so packaging is all that's needed to ship it.
