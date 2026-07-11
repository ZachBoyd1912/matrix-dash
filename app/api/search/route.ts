import { searchMemoriesFts, searchNotesFts } from "@/lib/db/fts";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

export const GET = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return Response.json({ memories: [], notes: [] });

  return Response.json({
    memories: searchMemoriesFts(q, 10),
    notes: searchNotesFts(q, 10),
  });
});
