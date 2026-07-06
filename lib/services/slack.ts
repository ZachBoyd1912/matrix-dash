import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { slackWorkspaces } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";

function slackApi(workspaceId: string) {
  const ws = getDb()
    .select()
    .from(slackWorkspaces)
    .where(eq(slackWorkspaces.id, workspaceId))
    .get();
  if (!ws) throw new Error("No Slack workspace found");
  const token = decrypt(ws.accessToken);
  return (method: string, body?: unknown) =>
    fetch("https://slack.com/api/" + method, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => r.json());
}

export async function testSlackConnection(workspaceId: string): Promise<boolean> {
  try {
    const r = await slackApi(workspaceId)("auth.test");
    return r.ok as boolean;
  } catch {
    return false;
  }
}

export async function listChannels(workspaceId: string) {
  const api = slackApi(workspaceId);
  const r = await api("conversations.list", {
    types: "public_channel,private_channel",
  });
  return (r.channels || []) as Array<{
    id: string;
    name: string;
    topic: { value: string };
    num_members: number;
    is_private: boolean;
  }>;
}

export async function sendMessage(workspaceId: string, channel: string, text: string) {
  return slackApi(workspaceId)("chat.postMessage", { channel, text });
}

export async function sendThreadReply(
  workspaceId: string,
  channel: string,
  threadTs: string,
  text: string
) {
  return slackApi(workspaceId)("chat.postMessage", {
    channel,
    thread_ts: threadTs,
    text,
  });
}

export async function searchMessages(workspaceId: string, query: string) {
  const r = await slackApi(workspaceId)("search.messages", { query });
  return (r.messages?.matches || []) as Array<{
    channel: { id: string; name: string };
    text: string;
    username: string;
    ts: string;
  }>;
}

export async function uploadFile(
  workspaceId: string,
  channel: string,
  content: string,
  title: string
) {
  const ws = getDb()
    .select()
    .from(slackWorkspaces)
    .where(eq(slackWorkspaces.id, workspaceId))
    .get();
  if (!ws) throw new Error("No workspace");
  const form = new FormData();
  form.append("token", decrypt(ws.accessToken));
  form.append("channels", channel);
  form.append("content", content);
  form.append("title", title);
  return fetch("https://slack.com/api/files.upload", {
    method: "POST",
    body: form,
  }).then((r) => r.json());
}
