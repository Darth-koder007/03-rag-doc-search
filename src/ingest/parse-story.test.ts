import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseComponentUsage } from "./parse-story.js";

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
}

describe("parseComponentUsage", () => {
  it("extracts the meta title, args-only stories, and custom-render stories", () => {
    const chunk = parseComponentUsage("Widget", fixturePath("Widget.stories.tsx"));

    expect(chunk.id).toBe("Widget:usage");
    expect(chunk.section).toBe("usage");
    expect(chunk.text).toContain('Storybook title: "Primitives/Widget"');
    expect(chunk.text).toContain('Story "Small": args = { size: "sm" }');
    expect(chunk.text).toContain('Story "Large": args = { size: "lg" }');
    expect(chunk.text).toContain('Story "Row" — custom render:');
    expect(chunk.text).toContain('<Widget {...args} size="sm" />');
  });
});
