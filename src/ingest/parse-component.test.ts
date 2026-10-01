import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseComponentApi } from "./parse-component.js";

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
}

describe("parseComponentApi", () => {
  it("extracts exported type aliases, props, and a deprecated prop's JSDoc note", () => {
    const chunk = parseComponentApi("Widget", fixturePath("Widget.tsx"));

    expect(chunk.id).toBe("Widget:api");
    expect(chunk.componentName).toBe("Widget");
    expect(chunk.section).toBe("api");
    expect(chunk.text).toContain('type WidgetSize = "sm" | "md" | "lg"');
    expect(chunk.text).toContain("interface WidgetProps");
    expect(chunk.text).toContain("size?: WidgetSize");
    expect(chunk.text).toContain("label: string");
    expect(chunk.text).toContain(
      "scale?: WidgetSize — deprecated: Use `size` instead. Will be removed in 1.0."
    );
  });

  it("has no deprecated-note artifact for a component with no JSDoc comments", () => {
    const chunk = parseComponentApi("Gadget", fixturePath("Gadget.tsx"));

    expect(chunk.text).toContain("interface GadgetProps");
    expect(chunk.text).toContain("active: boolean");
    expect(chunk.text).not.toContain("—");
  });
});
