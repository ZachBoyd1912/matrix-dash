import { describe, it, expect, beforeEach } from "vitest";
import { useTour, TOUR_CHAPTERS } from "@/lib/stores/use-tour";

/** Tour navigation: chapter/step advancement, owner-only filtering, finish. */

describe("useTour store", () => {
  beforeEach(() => useTour.getState().stop());

  it("filters owner-only chapters for members", () => {
    useTour.getState().start({ isOwner: false });
    const chapters = useTour.getState().chapters;
    expect(chapters.some((c) => c.ownerOnly)).toBe(false);

    useTour.getState().start({ isOwner: true });
    expect(useTour.getState().chapters.some((c) => c.ownerOnly)).toBe(true);
  });

  it("advances step→chapter→finish and supports back", () => {
    useTour.getState().start({ isOwner: true });
    expect(useTour.getState().active).toBe(true);
    const total = useTour.getState().chapters.reduce((n, c) => n + c.steps.length, 0);

    // Walk to the last step.
    for (let i = 0; i < total - 1; i++) {
      expect(useTour.getState().isLast()).toBe(false);
      useTour.getState().next();
    }
    expect(useTour.getState().isLast()).toBe(true);

    // Back goes to the previous step.
    const before = useTour.getState().current();
    useTour.getState().prev();
    expect(useTour.getState().current()).not.toEqual(before);

    // Next past the end deactivates.
    useTour.getState().next();
    useTour.getState().next();
    expect(useTour.getState().active).toBe(false);
  });

  it("current() is null when inactive", () => {
    expect(useTour.getState().current()).toBeNull();
  });

  it("every chapter has at least one step", () => {
    for (const c of TOUR_CHAPTERS) expect(c.steps.length).toBeGreaterThan(0);
  });
});
