import { searchVectorStore, type VectorStore } from "./store/vector-store.js";
import type { EmbeddingClient } from "./embeddings/types.js";
import type { Chunk } from "./types.js";

export interface RetrievalResult {
  confident: boolean;
  matches: { chunk: Chunk; score: number }[];
}

/**
 * The confidence threshold on cosine similarity below which retrieval reports "no documentation
 * found" instead of handing the LLM a weak match to improvise around. Tuned against this
 * project's real embedding model (`nomic-embed-text` via Ollama) — see PLAN.md's M3.3 entry for
 * the actual in-scope vs. out-of-scope scores that set this number, not a guessed default.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

export async function retrieve(
  query: string,
  store: VectorStore,
  embeddingClient: EmbeddingClient,
  k = 3,
  threshold = DEFAULT_CONFIDENCE_THRESHOLD
): Promise<RetrievalResult> {
  const queryVector = await embeddingClient.embed(query);
  const matches = searchVectorStore(store, queryVector, k);
  const confident = matches.length > 0 && matches[0]!.score >= threshold;
  return { confident, matches };
}
