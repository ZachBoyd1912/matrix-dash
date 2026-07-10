import { describe, it, expect, beforeEach, vi } from "vitest";

// Route handlers are now wrapped in withUser(), which resolves the request's
// session via getCurrentSession() (reads cookies() — unavailable outside a Next
// request). Mock it to an owner session: owner context resolves to the primary
// DB, so these direct-invocation tests behave exactly as before wrapping.
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentSession: async () => ({
    user: { id: "test-owner", role: "owner" },
    sessionId: "test-session",
    mfaSatisfied: true,
  }),
  getCurrentUser: async () => ({ id: "test-owner", role: "owner" }),
  getCloudflareAccessEmail: async () => null,
}));

import { GET, PATCH, DELETE } from "@/app/api/notifications/route";
import { getDb, resetTables } from "@/lib/test-db";
import { notifications } from "@/lib/db/schema";

describe("/api/notifications", () => {
  beforeEach(() => {
    resetTables("notifications");
  });

  it("GET returns an empty list when there are no notifications", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("GET returns notifications that were inserted directly", async () => {
    getDb()
      .insert(notifications)
      .values({
        id: "n1",
        title: "Test notification",
        body: "hello",
        kind: "info",
        isRead: false,
        createdAt: new Date().toISOString(),
      })
      .run();

    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "n1", title: "Test notification" });
  });

  it("PATCH marks all notifications as read", async () => {
    getDb()
      .insert(notifications)
      .values({
        id: "n2",
        title: "Unread",
        body: "",
        kind: "info",
        isRead: false,
        createdAt: new Date().toISOString(),
      })
      .run();

    const patchRes = await PATCH();
    expect((await patchRes.json()).ok).toBe(true);

    const res = await GET();
    const body = await res.json();
    expect(body[0].isRead).toBe(true);
  });

  it("DELETE clears all notifications", async () => {
    getDb()
      .insert(notifications)
      .values({
        id: "n3",
        title: "To delete",
        body: "",
        kind: "info",
        isRead: false,
        createdAt: new Date().toISOString(),
      })
      .run();

    const delRes = await DELETE();
    expect((await delRes.json()).ok).toBe(true);

    const res = await GET();
    expect(await res.json()).toEqual([]);
  });
});
