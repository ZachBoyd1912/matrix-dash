import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { render } from "@/lib/test-utils";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

const items = [
  { label: "Rename", onSelect: vi.fn() },
  { label: "Duplicate", onSelect: vi.fn() },
  { label: "Delete", onSelect: vi.fn(), danger: true },
];

describe("DropdownMenu", () => {
  it("does not steal focus on mount", () => {
    render(<DropdownMenu trigger="Open" items={items} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("opens and moves real DOM focus onto the first item via keyboard", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger="Open" items={items} />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus();
  });

  it("moves focus to the next item on ArrowDown, not just the highlight class", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger="Open" items={items} />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus();
  });

  it("restores focus to the trigger on Escape, not on a stray effect run", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger="Open" items={items} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(trigger).not.toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("selects the focused item on Enter and closes the menu", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DropdownMenu trigger="Open" items={[{ label: "Rename", onSelect }]} />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
