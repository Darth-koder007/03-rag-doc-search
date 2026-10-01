import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildVectorStore,
  loadVectorStore,
  saveVectorStore,
  searchVectorStore,
} from "./vector-store.js";
import type { Chunk } from "../types.js";
import type { EmbeddingClient } from "../embeddings/types.js";

function fakeChunk(componentName: string, text: string): Chunk {
  return { id: `${componentName}:api`, componentName, section: "api", sourceFile: "x.tsx", text };
}

function fakeEmbeddingClient(vectors: Record<string, number[]>): EmbeddingClient {
  return {
    provider: "fake",
    model: "fake-model",
    async embed(text: string) {
      const vector = vectors[text];
      if (!vector) throw new Error(`No fake vector configured for: ${text}`);
      return vector;
    },
  };
}

describe("buildVectorStore + searchVectorStore", () => {
  it("ranks the most similar chunk first by cosine similarity", async () => {
    const chunks = [fakeChunk("Button", "button text"), fakeChunk("Modal", "modal text")];
    const client = fakeEmbeddingClient({
      "button text": [1, 0],
      "modal text": [0, 1],
    });

    const store = await buildVectorStore(chunks, client);
    const results = searchVectorStore(store, [1, 0], 2);

    expect(results[0]!.chunk.componentName).toBe("Button");
    expect(results[0]!.score).toBeCloseTo(1, 5);
    expect(results[1]!.chunk.componentName).toBe("Modal");
    expect(results[1]!.score).toBeCloseTo(0, 5);
  });

  it("respects the k limit", async () => {
    const chunks = [fakeChunk("A", "a"), fakeChunk("B", "b"), fakeChunk("C", "c")];
    const client = fakeEmbeddingClient({ a: [1, 0], b: [0.9, 0.1], c: [0, 1] });

    const store = await buildVectorStore(chunks, client);
    const results = searchVectorStore(store, [1, 0], 2);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.chunk.componentName)).toEqual(["A", "B"]);
  });
});

describe("save/loadVectorStore", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a store through disk exactly", async () => {
    dir = mkdtempSync(join(tmpdir(), "vector-store-test-"));
    const chunks = [fakeChunk("Button", "button text")];
    const client = fakeEmbeddingClient({ "button text": [0.5, 0.5] });
    const store = await buildVectorStore(chunks, client);

    const filePath = join(dir, "store.json");
    saveVectorStore(store, filePath);
    const loaded = loadVectorStore(filePath);

    expect(loaded).toEqual(store);
  });
});
