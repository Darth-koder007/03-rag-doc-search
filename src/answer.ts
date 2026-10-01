import { retrieve, DEFAULT_CONFIDENCE_THRESHOLD } from "./retrieve.js";
import type { VectorStore } from "./store/vector-store.js";
import type { EmbeddingClient } from "./embeddings/types.js";
import type { LlmClient } from "./llm/types.js";
import type { ChunkSection } from "./types.js";

export interface Citation {
  componentName: string;
  section: ChunkSection;
  sourceFile: string;
}

export interface AnswerResult {
  answer: string;
  citations: Citation[];
  grounded: boolean;
}

const NO_DOCS_ANSWER =
  "I don't have documentation for that in this design system. Try rephrasing, or it may genuinely not exist here.";

const SYSTEM_PROMPT = `You are a design-system documentation assistant. You will be given a
question and one or more excerpts from the real component documentation. Answer using ONLY the
provided excerpts — do not invent props, components, or behavior that isn't in them. If the
excerpts don't actually answer the question, say so plainly instead of guessing. Keep the answer
concise and name the specific component(s) involved.`;

function buildPrompt(
  query: string,
  matches: { chunk: { componentName: string; text: string } }[]
): string {
  const context = matches
    .map((m, i) => `[Excerpt ${i + 1} — ${m.chunk.componentName}]\n${m.chunk.text}`)
    .join("\n\n");
  return `Question: ${query}\n\nDocumentation excerpts:\n\n${context}`;
}

/**
 * The confident/not-confident split happens before any LLM call — a low-confidence retrieval
 * returns a fixed, deterministic "no documentation" message, never a model's attempt to be
 * helpful anyway. This is the same shape as Project 1's rule-engine fallback: the honesty path
 * doesn't depend on the LLM behaving, because it never reaches the LLM at all.
 */
export async function answerQuestion(
  query: string,
  store: VectorStore,
  embeddingClient: EmbeddingClient,
  llmClient: LlmClient,
  k = 3,
  threshold = DEFAULT_CONFIDENCE_THRESHOLD
): Promise<AnswerResult> {
  const retrieval = await retrieve(query, store, embeddingClient, k, threshold);

  if (!retrieval.confident) {
    return { answer: NO_DOCS_ANSWER, citations: [], grounded: false };
  }

  const result = await llmClient.generate({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(query, retrieval.matches),
  });

  return {
    answer: result.text,
    citations: retrieval.matches.map((m) => ({
      componentName: m.chunk.componentName,
      section: m.chunk.section,
      sourceFile: m.chunk.sourceFile,
    })),
    grounded: true,
  };
}
