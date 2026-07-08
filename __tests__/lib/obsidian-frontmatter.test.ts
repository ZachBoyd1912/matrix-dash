import { describe, expect, it } from "vitest";
import { buildFrontmatter, parseFrontmatter, sanitizeFilename } from "@/lib/services/obsidian-sync";

describe("obsidian frontmatter round-trip", () => {
  it("preserves a body that starts with --- (markdown horizontal rule)", () => {
    // Regression: with no frontmatter emitted, a body starting with --- was
    // parsed as fake frontmatter on read-back and silently eaten.
    const body = "---\nnot frontmatter, a horizontal rule\n\nreal content";
    const file = buildFrontmatter({ tags: [], favorite: false }) + body;
    const parsed = parseFrontmatter(file);
    expect(parsed.body).toBe(body);
    expect(parsed.frontmatter.favorite).toBe("false");
  });

  it("round-trips tags and favorite", () => {
    const file = buildFrontmatter({ tags: ["a", "b c"], favorite: true }) + "hello";
    const parsed = parseFrontmatter(file);
    expect(parsed.frontmatter.tags).toBe("[a, b c]");
    expect(parsed.frontmatter.favorite).toBe("true");
    expect(parsed.body).toBe("hello");
  });

  it("treats a file with no frontmatter as all body", () => {
    const parsed = parseFrontmatter("plain content\nwith lines");
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe("plain content\nwith lines");
  });
});

describe("sanitizeFilename", () => {
  it("strips path separators and reserved characters", () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij.md");
  });

  it("cannot produce a path traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("....etcpasswd.md");
  });

  it("falls back for empty/whitespace titles", () => {
    expect(sanitizeFilename("   ")).toBe("Untitled.md");
  });
});
