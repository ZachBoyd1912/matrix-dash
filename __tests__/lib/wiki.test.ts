import { describe, it, expect } from "vitest";
import { extractWikiLinks } from "@/lib/utils/wiki";

describe("extractWikiLinks", () => {
  it("returns an empty array for content with no links", () => {
    expect(extractWikiLinks("just plain text")).toEqual([]);
  });

  it("extracts a single link", () => {
    expect(extractWikiLinks("see [[Project Plan]] for details")).toEqual(["Project Plan"]);
  });

  it("extracts multiple distinct links", () => {
    expect(extractWikiLinks("[[Note A]] links to [[Note B]] and [[Note A]]")).toEqual([
      "Note A",
      "Note B",
    ]);
  });

  it("strips the display-text alias after a pipe", () => {
    expect(extractWikiLinks("[[Real Title|shown text]]")).toEqual(["Real Title"]);
  });

  it("trims whitespace inside brackets", () => {
    expect(extractWikiLinks("[[  Padded Title  ]]")).toEqual(["Padded Title"]);
  });

  it("ignores an empty [[]]", () => {
    expect(extractWikiLinks("nothing here [[]]")).toEqual([]);
  });

  it("does not span across separate bracket pairs", () => {
    expect(extractWikiLinks("[[A]] some text [[B]]")).toEqual(["A", "B"]);
  });
});
