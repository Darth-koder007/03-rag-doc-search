import { readFileSync, writeFileSync } from "node:fs";
import type { Chunk } from "../types.js";
import type { EmbeddingClient } from "../embeddings/types.js";

export interface StoredEntry {
  chunk: Chunk;
  vector: number[];
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

export interface VectorStore {
  entries: StoredEntry[];
  provider: string;
  model: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Brute-force cosine similarity over an in-memory array, not an ANN index. This corpus is a few
 * dozen chunks (one design system's worth of components) — an index built for million-row
 * scale would be solving a problem this project doesn't have. Self-hostable and zero-infra
 * (the plan's actual requirement) without a native dependency like `sqlite-vec`, which risks
 * failing to install/build in CI for a dataset this small.
 */
export async function buildVectorStore(
  chunks: Chunk[],
  embeddingClient: EmbeddingClient
): Promise<VectorStore> {
  const entries: StoredEntry[] = [];
  for (const chunk of chunks) {
    const vector = await embeddingClient.embed(chunk.text);
    entries.push({ chunk, vector });
  }
  return { entries, provider: embeddingClient.provider, model: embeddingClient.model };
}

export function searchVectorStore(
  store: VectorStore,
  queryVector: number[],
  k: number
): SearchResult[] {
  return store.entries
    .map((entry) => ({ chunk: entry.chunk, score: cosineSimilarity(queryVector, entry.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function saveVectorStore(store: VectorStore, filePath: string): void {
  writeFileSync(filePath, JSON.stringify(store));
}

export function loadVectorStore(filePath: string): VectorStore {
  return JSON.parse(readFileSync(filePath, "utf8")) as VectorStore;
}
