import { getSetting } from "@/lib/db/settings";
import { runJarvisTurn } from "@/lib/ai/jarvis";
import { resolveSttEndpoint } from "@/lib/ai/voice-provider";

/**
 * Telegram bridge for Jarvis. Long-polls the Bot API; for messages from the one
 * allowed chat id, it transcribes voice notes (Whisper) and runs a Jarvis turn,
 * replying with text. All other chat ids are rejected. Started at boot (like the
 * obsidian watcher) and re-init on settings change. Singleton on globalThis.
 */

interface BotState {
  running: boolean;
  offset: number;
  abort: AbortController | null;
  token: string;
}

const KEY = Symbol.for("matrix-dash.telegram-bot");
function state(): BotState {
  const g = globalThis as unknown as Record<symbol, BotState | undefined>;
  if (!g[KEY]) g[KEY] = { running: false, offset: 0, abort: null, token: "" };
  return g[KEY]!;
}

function api(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

export function initTelegramBot(): void {
  const token = getSetting("telegram_bot_token")?.trim();
  const chatId = getSetting("telegram_chat_id")?.trim();
  const s = state();
  if (!token || !chatId) {
    stopTelegramBot();
    return;
  }
  if (s.running && s.token === token) return; // already polling this token
  stopTelegramBot();
  s.token = token;
  s.running = true;
  s.abort = new AbortController();
  void pollLoop(token, chatId, s.abort.signal);
  console.log("[telegram] bridge started");
}

export function stopTelegramBot(): void {
  const s = state();
  s.running = false;
  s.abort?.abort();
  s.abort = null;
}

async function pollLoop(token: string, allowedChatId: string, signal: AbortSignal): Promise<void> {
  const s = state();
  while (s.running && !signal.aborted) {
    try {
      const res = await fetch(`${api(token, "getUpdates")}?timeout=25&offset=${s.offset}`, {
        signal,
      });
      if (!res.ok) {
        await sleep(5000, signal);
        continue;
      }
      const data = (await res.json()) as { result?: TelegramUpdate[] };
      for (const update of data.result ?? []) {
        s.offset = update.update_id + 1;
        await handleUpdate(token, allowedChatId, update).catch(() => {});
      }
    } catch {
      if (signal.aborted) break;
      await sleep(5000, signal);
    }
  }
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    voice?: { file_id: string };
  };
}

async function handleUpdate(
  token: string,
  allowedChatId: string,
  update: TelegramUpdate
): Promise<void> {
  const msg = update.message;
  if (!msg) return;
  // Reject any chat that isn't the authorized one.
  if (String(msg.chat.id) !== allowedChatId) {
    await send(token, msg.chat.id, "Not authorized.");
    return;
  }

  let text = msg.text?.trim() ?? "";
  if (!text && msg.voice) {
    text = (await transcribeVoice(token, msg.voice.file_id)) ?? "";
    if (!text) {
      await send(token, msg.chat.id, "Sorry, I couldn't transcribe that.");
      return;
    }
  }
  if (!text) return;

  const { reply } = await runJarvisTurn(text);
  await send(token, msg.chat.id, reply || "(no reply)");
}

async function transcribeVoice(token: string, fileId: string): Promise<string | null> {
  const endpoint = resolveSttEndpoint();
  if (!endpoint) return null;
  try {
    const infoRes = await fetch(`${api(token, "getFile")}?file_id=${fileId}`);
    const info = (await infoRes.json()) as { result?: { file_path?: string } };
    const filePath = info.result?.file_path;
    if (!filePath) return null;
    const audioRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    const audio = await audioRes.blob();

    const form = new FormData();
    form.append("file", audio, "voice.oga");
    form.append("model", endpoint.kind === "groq" ? "whisper-large-v3" : "whisper-1");
    const sttRes = await fetch(`${endpoint.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${endpoint.apiKey}` },
      body: form,
    });
    if (!sttRes.ok) return null;
    const data = (await sttRes.json()) as { text?: string };
    return (data.text ?? "").trim() || null;
  } catch {
    return null;
  }
}

async function send(token: string, chatId: number, text: string): Promise<void> {
  try {
    await fetch(api(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
    });
  } catch {
    /* best-effort */
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}
