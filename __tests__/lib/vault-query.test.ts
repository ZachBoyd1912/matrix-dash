import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { memories, notes, vaultFiles, vaultLinks } from "@/lib/db/schema";
import {
  GRAPH_NODE_CAP,
  buildVaultGraph,
  buildVaultTree,
  compareTopFolders,
  folderColor,
  getVaultFile,
  searchVault,
  topFolder,
} from "@/lib/services/vault-query";

function addFile(relPath: string, content = "", isText = true) {
  const slash = relPath.lastIndexOf("/");
  getDb()
    .insert(vaultFiles)
    .values({
      relPath,
      name: relPath.slice(slash + 1),
      ext: relPath.slice(relPath.lastIndexOf(".") + 1),
      dirPath: slash === -1 ? "" : relPath.slice(0, slash),
      mtimeMs: 1,
      isText,
      content,
      indexedAt: "2026-08-07T00:00:00.000Z",
    })
    .run();
}

function addLink(sourcePath: string, targetPath: string | null, targetRaw: string) {
  getDb()
    .insert(vaultLinks)
    .values({ id: randomUUID(), sourcePath, targetPath, targetRaw, kind: "wikilink" })
    .run();
}

beforeEach(() => {
  getDb().delete(vaultFiles).run();
  getDb().delete(vaultLinks).run();
  getDb().delete(notes).run();
  getDb().delete(memories).run();
});

describe("topFolder / folderColor", () => {
  it("reads the first path segment, and empty for a root file", () => {
    expect(topFolder("Claude Code/Memory/x/a.md")).toBe("Claude Code");
    expect(topFolder("README.md")).toBe("");
  });

  it("keeps a folder's colour stable when another folder appears", () => {
    // Colour is assigned by position in the SORTED folder list, so adding
    // "Zeta" must not repaint "Matrix Notes". Insertion order would.
    const before = folderColor("Matrix Notes", ["Claude Code", "Matrix Notes"]);
    const after = folderColor("Matrix Notes", ["Claude Code", "Matrix Notes", "Zeta"]);
    expect(after).toBe(before);
  });
});

describe("compareTopFolders", () => {
  it("pins the folders matrix-dash owns above everything else", () => {
    const sorted = ["Zeta", "Claude Code", "Memory Bank", "Matrix Notes", "Attachments"].sort(
      compareTopFolders
    );
    expect(sorted).toEqual(["Matrix Notes", "Memory Bank", "Attachments", "Claude Code", "Zeta"]);
  });
});

describe("buildVaultTree", () => {
  it("nests folders to any depth and counts files recursively", () => {
    addFile("README.md", "root file");
    addFile("Claude Code/README.md", "cc readme");
    addFile("Claude Code/Memory/matrix-dash/a.md", "a");
    addFile("Claude Code/Memory/matrix-dash/b.md", "b");

    const { folders, rootFiles } = buildVaultTree();
    expect(rootFiles.map((f) => f.relPath)).toEqual(["README.md"]);

    const cc = folders.find((f) => f.name === "Claude Code")!;
    expect(cc.fileCount).toBe(3);
    expect(cc.files.map((f) => f.name)).toEqual(["README.md"]);
    const memory = cc.folders.find((f) => f.name === "Memory")!;
    const project = memory.folders.find((f) => f.name === "matrix-dash")!;
    expect(project.files.map((f) => f.name)).toEqual(["a.md", "b.md"]);
  });

  it("shows folders the old Claude-Code-only sidebar could not reach", () => {
    // The user's complaint: the graph and sidebar showed one subfolder. Every
    // folder must appear, discovered from the data, with no code change.
    addFile("Claude Code/Sessions/2026-07-15 - Session.md", "notes");
    addFile("Attachments/diagram.png", "", false);

    const names = buildVaultTree().folders.map((f) => f.name);
    expect(names).toContain("Claude Code");
    expect(names).toContain("Attachments");
  });

  it("still lists a note whose vault file does not exist yet", () => {
    // Obsidian sync off, or not yet run. A pure mirror of the vault would hide
    // the user's own notes from the page that exists to show them.
    const id = randomUUID();
    getDb()
      .insert(notes)
      .values({ id, title: "Unsynced", content: "body", createdAt: "t", updatedAt: "t" })
      .run();

    const notesFolder = buildVaultTree().folders.find((f) => f.name === "Matrix Notes")!;
    expect(notesFolder.files).toHaveLength(1);
    expect(notesFolder.files[0].noteId).toBe(id);
    expect(notesFolder.files[0].notInVault).toBe(true);
  });

  it("does not list a note twice once its vault file is indexed", () => {
    const id = randomUUID();
    getDb()
      .insert(notes)
      .values({
        id,
        title: "Synced",
        content: "body",
        vaultRelPath: "Synced.md",
        createdAt: "t",
        updatedAt: "t",
      })
      .run();
    addFile("Matrix Notes/Synced.md", "body");

    const notesFolder = buildVaultTree().folders.find((f) => f.name === "Matrix Notes")!;
    expect(notesFolder.files).toHaveLength(1);
    expect(notesFolder.files[0].notInVault).toBe(false);
    expect(notesFolder.files[0].noteId).toBe(id);
  });

  it("links a vault file back to the note row that owns it", () => {
    const id = randomUUID();
    getDb()
      .insert(notes)
      .values({
        id,
        title: "Site Auditor",
        content: "body",
        vaultRelPath: "Site Auditor — 2026-07-09.md",
        createdAt: "t",
        updatedAt: "t",
      })
      .run();
    addFile("Matrix Notes/Site Auditor — 2026-07-09.md", "body");
    addFile("Claude Code/Memory/x/other.md", "body");

    const { folders } = buildVaultTree();
    const notesFolder = folders.find((f) => f.name === "Matrix Notes")!;
    expect(notesFolder.files[0].noteId).toBe(id);
    const cc = folders.find((f) => f.name === "Claude Code")!;
    expect(cc.folders[0].folders[0].files[0].noteId).toBeNull();
  });
});

describe("getVaultFile", () => {
  it("returns frontmatter, body and what links here", () => {
    addFile("Memory Bank/target.md", "---\ntype: project\n---\n\nthe body");
    addFile("Memory Bank/a.md", "see [[target]]");
    addFile("Claude Code/Memory/x/b.md", "also [[target]]");
    addLink("Memory Bank/a.md", "Memory Bank/target.md", "target");
    addLink("Claude Code/Memory/x/b.md", "Memory Bank/target.md", "target");

    const file = getVaultFile("Memory Bank/target.md")!;
    expect(file.frontmatter.type).toBe("project");
    expect(file.body).toBe("the body");
    expect(file.backlinks.map((b) => b.relPath)).toEqual([
      "Claude Code/Memory/x/b.md",
      "Memory Bank/a.md",
    ]);
  });

  it("reports an unresolved outgoing link instead of hiding it", () => {
    addFile("a.md", "points at [[nowhere]]");
    addLink("a.md", null, "nowhere");

    const file = getVaultFile("a.md")!;
    expect(file.outgoing).toEqual([{ relPath: null, raw: "nowhere" }]);
  });

  it("returns null for a path that is not indexed", () => {
    expect(getVaultFile("nope.md")).toBeNull();
  });
});

describe("searchVault", () => {
  it("finds a phrase that exists only inside a Claude Code file", () => {
    addFile("Claude Code/Memory/matrix-dash/deploy.md", "the artifact pipeline replaces resizing");
    addFile("Matrix Notes/unrelated.md", "nothing to see");

    const hits = searchVault("artifact");
    expect(hits.map((h) => h.relPath)).toContain("Claude Code/Memory/matrix-dash/deploy.md");
    expect(hits.map((h) => h.relPath)).not.toContain("Matrix Notes/unrelated.md");
  });

  it("still matches a partial filename, which FTS tokenization cannot", () => {
    // "matr" is a prefix of a path segment, not a whole token — full-text
    // search alone returns nothing and the box feels broken.
    addFile("Claude Code/Memory/matrix-dash/notes.md", "body text");
    const hits = searchVault("matrix-dash");
    expect(hits.map((h) => h.relPath)).toContain("Claude Code/Memory/matrix-dash/notes.md");
  });

  it("returns nothing for an empty query rather than the whole vault", () => {
    addFile("a.md", "content");
    expect(searchVault("  ")).toEqual([]);
  });
});

describe("buildVaultGraph", () => {
  it("draws an edge for every resolved link across the whole vault", () => {
    addFile("Matrix Notes/a.md", "[[b]]");
    addFile("Claude Code/Memory/x/b.md", "back to [[a]]");
    addLink("Matrix Notes/a.md", "Claude Code/Memory/x/b.md", "b");
    addLink("Claude Code/Memory/x/b.md", "Matrix Notes/a.md", "a");

    const graph = buildVaultGraph();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.links).toHaveLength(2);
    // Cross-folder edges are the whole point — the old graph could not draw one.
    expect(graph.links.map((l) => l.source).sort()).toEqual([
      "vault:Claude Code/Memory/x/b.md",
      "vault:Matrix Notes/a.md",
    ]);
    expect(graph.nodes.every((n) => n.degree === 2)).toBe(true);
  });

  it("renders an unresolved link as a ghost node, shared between sources", () => {
    addFile("a.md", "[[missing]]");
    addFile("b.md", "[[missing]]");
    addLink("a.md", null, "missing");
    addLink("b.md", null, "missing");

    const graph = buildVaultGraph();
    const ghosts = graph.nodes.filter((n) => n.isGhost);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].label).toBe("missing");
    expect(graph.links).toHaveLength(2);
  });

  it("colours nodes by their top-level folder and lists them in the legend", () => {
    addFile("Matrix Notes/a.md", "x");
    addFile("Claude Code/b.md", "x");

    const graph = buildVaultGraph();
    const a = graph.nodes.find((n) => n.relPath === "Matrix Notes/a.md")!;
    const b = graph.nodes.find((n) => n.relPath === "Claude Code/b.md")!;
    expect(a.color).not.toBe(b.color);
    expect(graph.folders.map((f) => f.name)).toEqual(["Matrix Notes", "Claude Code"]);
  });

  it("reports truncation with the real total instead of silently capping", () => {
    for (let i = 0; i < GRAPH_NODE_CAP + 5; i++) {
      addFile(`Bulk/f${String(i).padStart(5, "0")}.md`, "x");
    }
    const graph = buildVaultGraph();
    expect(graph.truncated).toBe(true);
    expect(graph.total).toBe(GRAPH_NODE_CAP + 5);
    expect(graph.nodes).toHaveLength(GRAPH_NODE_CAP);
  });

  it("drops an edge whose target fell outside the cap rather than dangling it", () => {
    // A link pointing at a node that was truncated away would make d3-force
    // reference a node that does not exist in the payload.
    for (let i = 0; i < GRAPH_NODE_CAP + 1; i++) {
      addFile(`Bulk/f${String(i).padStart(5, "0")}.md`, "x");
    }
    const last = `Bulk/f${String(GRAPH_NODE_CAP).padStart(5, "0")}.md`;
    addLink("Bulk/f00000.md", last, "f01500");

    const graph = buildVaultGraph();
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(graph.links.every((l) => ids.has(l.source) && ids.has(l.target))).toBe(true);
  });
});
