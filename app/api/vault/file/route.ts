import { z } from "zod";
import { withUser } from "@/lib/auth/with-user";
import { getVaultFile } from "@/lib/services/vault-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(1024)
    // Traversal is already structurally impossible — the path is looked up as
    // a primary key in vault_files and never joined onto a filesystem root —
    // but rejecting it here keeps that from becoming an implementation detail
    // a later change could quietly remove.
    .refine((p) => !p.startsWith("/") && !p.includes("\\") && !p.split("/").includes(".."), {
      message: "invalid path",
    }),
});

/** One indexed vault file: frontmatter, body, backlinks. GET-only. */
export const GET = withUser(async (req: Request) => {
  const parsed = paramsSchema.safeParse({
    path: new URL(req.url).searchParams.get("path") ?? "",
  });
  if (!parsed.success) return Response.json({ error: "Invalid path" }, { status: 400 });

  const file = getVaultFile(parsed.data.path);
  if (!file) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(file);
});
