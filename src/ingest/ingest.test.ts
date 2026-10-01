import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ingestDocs } from "./ingest.js";

describe("ingestDocs", () => {
  it("produces an api chunk and a usage chunk for a component with stories, and only an api chunk for one without", () => {
    const docsRoot = fileURLToPath(new URL("../../fixtures", import.meta.url));
    const chunks = ingestDocs(docsRoot);

    const widgetChunks = chunks.filter((c) => c.componentName === "Widget");
    const gadgetChunks = chunks.filter((c) => c.componentName === "Gadget");

    expect(widgetChunks.map((c) => c.section).sort()).toEqual(["api", "usage"]);
    expect(gadgetChunks.map((c) => c.section)).toEqual(["api"]);
  });

  it("gives every chunk a correct, distinct id and source file path", () => {
    const docsRoot = fileURLToPath(new URL("../../fixtures", import.meta.url));
    const chunks = ingestDocs(docsRoot);

    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chunk of chunks) {
      expect(chunk.sourceFile).toContain(chunk.componentName);
    }
  });
});
