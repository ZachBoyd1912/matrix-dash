// @ts-check
// Matrix Agent webview controller. Dependency-free. Talks to the extension host
// over the typed postMessage protocol declared in src/extension.ts:
//   out (host → here): config | userEcho | start | text | reasoning | error | done | reset | info
//   in  (here → host): ready | send | cancel | applyEdit | runInTerminal
(function () {
  "use strict";

  const vscode = acquireVsCodeApi();

  /** @type {HTMLElement} */
  const messagesEl = /** @type {HTMLElement} */ (document.getElementById("messages"));
  /** @type {HTMLFormElement} */
  const composer = /** @type {HTMLFormElement} */ (document.getElementById("composer"));
  /** @type {HTMLTextAreaElement} */
  const input = /** @type {HTMLTextAreaElement} */ (document.getElementById("input"));
  /** @type {HTMLButtonElement} */
  const sendBtn = /** @type {HTMLButtonElement} */ (document.getElementById("send"));
  /** @type {HTMLButtonElement} */
  const stopBtn = /** @type {HTMLButtonElement} */ (document.getElementById("stop"));

  // Live references to the assistant turn currently streaming.
  /** @type {HTMLElement | null} */ let activeBody = null;
  /** @type {HTMLElement | null} */ let activeReasoning = null;
  let activeText = "";
  let reasoningText = "";
  let streaming = false;
  let mode = "agent";

  // ---- rendering helpers --------------------------------------------------

  /**
   * Appends a message row and returns its body element.
   * @param {"user" | "assistant" | "system"} role
   */
  function addRow(role) {
    const row = document.createElement("div");
    row.className = "row " + role;

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = role === "user" ? "You" : role === "system" ? "System" : "Agent";
    row.appendChild(label);

    const body = document.createElement("div");
    body.className = "body";
    row.appendChild(body);

    messagesEl.appendChild(row);
    scrollToEnd();
    return body;
  }

  function scrollToEnd() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /**
   * Renders text with minimal, safe formatting: fenced code blocks become
   * <pre>, everything else is escaped plain text. Returns nothing — it rewrites
   * `el`. Fences of the form ```lang:path or ```run get action buttons.
   * @param {HTMLElement} el
   * @param {string} text
   */
  function renderInto(el, text) {
    el.textContent = "";
    const parts = text.split(/```/);
    parts.forEach((part, i) => {
      if (i % 2 === 0) {
        if (part) el.appendChild(textNode(part));
        return;
      }
      // Odd segments are code fences: first line may carry a `lang` or `lang:path`
      // or `run` directive, the rest is the body.
      const newline = part.indexOf("\n");
      const info = (newline === -1 ? "" : part.slice(0, newline)).trim();
      const code = newline === -1 ? part : part.slice(newline + 1);
      el.appendChild(codeBlock(info, code.replace(/\n$/, "")));
    });
  }

  /** @param {string} value */
  function textNode(value) {
    const span = document.createElement("span");
    span.className = "prose";
    span.textContent = value;
    return span;
  }

  /**
   * @param {string} info  e.g. "ts:src/x.ts", "run", "bash"
   * @param {string} code
   */
  function codeBlock(info, code) {
    const wrap = document.createElement("div");
    wrap.className = "code";

    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    wrap.appendChild(pre);

    // Action directives: `run` → runInTerminal; `lang:path` → applyEdit to path.
    const directive = info.toLowerCase();
    if (directive === "run" || directive === "sh" || directive === "bash" || directive === "shell") {
      wrap.appendChild(
        actionButton("▶ Run in terminal", function () {
          vscode.postMessage({ type: "runInTerminal", command: code });
        })
      );
    } else if (info.includes(":")) {
      const path = info.slice(info.indexOf(":") + 1).trim();
      if (path) {
        wrap.appendChild(
          actionButton("✎ Apply to " + path, function () {
            vscode.postMessage({ type: "applyEdit", path: path, content: code });
          })
        );
      }
    }
    return wrap;
  }

  /**
   * @param {string} label
   * @param {() => void} onClick
   */
  function actionButton(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  /** @param {string} text */
  function systemNote(text) {
    const body = addRow("system");
    body.textContent = text;
  }

  // ---- streaming lifecycle ------------------------------------------------

  function beginAssistant() {
    activeText = "";
    reasoningText = "";
    activeReasoning = null;
    activeBody = addRow("assistant");
    activeBody.classList.add("streaming");
  }

  function endAssistant() {
    if (activeBody) {
      activeBody.classList.remove("streaming");
      // Drop an empty assistant bubble (e.g. cancelled before any text).
      if (!activeText.trim() && activeBody.parentElement) {
        activeBody.parentElement.remove();
      }
    }
    activeBody = null;
    activeReasoning = null;
    streaming = false;
    setBusy(false);
  }

  /** @param {string} value */
  function appendReasoning(value) {
    if (!activeBody) return;
    if (!activeReasoning) {
      const details = document.createElement("details");
      details.className = "reasoning";
      const summary = document.createElement("summary");
      summary.textContent = "Reasoning";
      details.appendChild(summary);
      const pre = document.createElement("div");
      pre.className = "reasoning-body";
      details.appendChild(pre);
      activeBody.appendChild(details);
      activeReasoning = pre;
    }
    reasoningText += value;
    activeReasoning.textContent = reasoningText;
    scrollToEnd();
  }

  /** @param {boolean} busy */
  function setBusy(busy) {
    streaming = busy;
    sendBtn.hidden = busy;
    stopBtn.hidden = !busy;
    input.disabled = busy;
  }

  // ---- inbound messages from the extension host ---------------------------

  window.addEventListener("message", function (event) {
    const msg = event.data;
    switch (msg.type) {
      case "config":
        mode = msg.mode;
        break;
      case "userEcho": {
        const body = addRow("user");
        body.textContent = msg.text;
        break;
      }
      case "start":
        beginAssistant();
        break;
      case "text":
        if (!activeBody) beginAssistant();
        activeText += msg.value;
        if (activeBody) renderInto(activeBody, activeText);
        scrollToEnd();
        break;
      case "reasoning":
        appendReasoning(msg.value);
        break;
      case "error":
        systemNote("⚠ " + msg.value);
        break;
      case "done":
        endAssistant();
        break;
      case "reset":
        messagesEl.textContent = "";
        endAssistant();
        break;
      case "info":
        systemNote(msg.value);
        break;
    }
  });

  // ---- outbound: user actions ---------------------------------------------

  function submit() {
    const text = input.value.trim();
    if (!text || streaming) return;
    setBusy(true);
    vscode.postMessage({ type: "send", text: text });
    input.value = "";
    autoSize();
  }

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    submit();
  });

  stopBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "cancel" });
  });

  // Enter sends; Shift+Enter inserts a newline.
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  function autoSize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }
  input.addEventListener("input", autoSize);

  // Announce readiness so the host can push the initial config.
  vscode.postMessage({ type: "ready" });
})();
