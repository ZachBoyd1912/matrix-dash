import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { attachments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Accept a file upload. Images are stored as data URLs (for vision models);
 * PDFs/text are extracted to plain text for RAG. Returns the attachment record
 * plus any extracted text so the client can prepend it as chat context.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Expected multipart form" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  const id = randomUUID();
  let kind = "file";
  let dataUrl: string | null = null;
  let extractedText: string | null = null;

  if (mime.startsWith("image/")) {
    kind = "image";
    dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  } else if (mime === "application/pdf") {
    kind = "pdf";
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      extractedText = result.text.slice(0, 40000);
    } catch (err) {
      extractedText = `[Could not extract PDF: ${err instanceof Error ? err.message : String(err)}]`;
    }
  } else if (mime.startsWith("text/") || mime === "application/json") {
    kind = "text";
    extractedText = buf.toString("utf-8").slice(0, 40000);
  } else {
    extractedText = "[Unsupported file type for extraction]";
  }

  getDb()
    .insert(attachments)
    .values({
      id,
      name: file.name,
      mime,
      kind,
      dataUrl,
      extractedText,
      createdAt: new Date().toISOString(),
    })
    .run();

  return Response.json({ id, name: file.name, kind, mime, extractedText, hasImage: !!dataUrl });
}
