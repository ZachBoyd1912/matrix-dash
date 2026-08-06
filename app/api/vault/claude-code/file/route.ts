import { z } from "zod";
import { withUser } from "@/lib/auth/with-user";
import { readClaudeCodeFile } from "@/lib/services/claude-code-vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({
  project: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^/\\]+$/, "invalid project"),
  file: z
    .string()
    .min(1)
    .max(300)
    .regex(/^[^/\\]+$/, "invalid file"),
});

/** Read-only single-file fetch. GET-only — see the tree route's comment. */
export const GET = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const parsed = paramsSchema.safeParse({
    project: url.searchParams.get("project") ?? "",
    file: url.searchParams.get("file") ?? "",
  });
  if (!parsed.success) return Response.json({ error: "Invalid project/file" }, { status: 400 });

  const result = await readClaudeCodeFile(parsed.data.project, parsed.data.file);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(result);
});
