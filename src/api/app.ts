import { timingSafeEqual } from "node:crypto";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { answerQuestion } from "../answer.js";
import { retrieve } from "../retrieve.js";
import type { EmbeddingClient } from "../embeddings/types.js";
import type { LlmClient } from "../llm/types.js";
import type { VectorIndex } from "../store/vector-store.js";

export interface AppDependencies {
  index: VectorIndex;
  embeddingClient: EmbeddingClient;
  llmClient: LlmClient;
  apiToken: string;
  /** Per embedding model: cosine scores are not comparable across models. */
  confidenceThreshold?: number;
  checkDatabase?: () => Promise<void>;
}

const MAX_QUESTION_LENGTH = 500;
const MAX_K = 10;

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on unequal lengths, and a length check alone would leak the length
  // only, which a fixed-format token doesn't treat as secret.
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateQuestion(body: unknown, field: string): { value: string } | { error: string } {
  const raw = (body as Record<string, unknown> | null)?.[field];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { error: `"${field}" must be a non-empty string` };
  }
  if (raw.length > MAX_QUESTION_LENGTH) {
    return { error: `"${field}" must be at most ${MAX_QUESTION_LENGTH} characters` };
  }
  return { value: raw.trim() };
}

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();

  app.get("/healthz", async (c) => {
    try {
      await deps.checkDatabase?.();
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
    return c.json({ status: "ok", index: `${deps.index.provider}:${deps.index.model}` });
  });

  app.use("/search", requireToken(deps.apiToken));
  app.use("/ask", requireToken(deps.apiToken));

  app.post("/search", async (c) => {
    const body = await c.req.json().catch(() => null);
    const query = validateQuestion(body, "query");
    if ("error" in query) return c.json({ error: query.error }, 400);

    const rawK = (body as { k?: unknown }).k;
    const k = rawK === undefined ? 3 : rawK;
    if (typeof k !== "number" || !Number.isInteger(k) || k < 1 || k > MAX_K) {
      return c.json({ error: `"k" must be an integer between 1 and ${MAX_K}` }, 400);
    }

    try {
      const result = await retrieve(
        query.value,
        deps.index,
        deps.embeddingClient,
        k,
        deps.confidenceThreshold
      );
      return c.json({
        confident: result.confident,
        matches: result.matches.map((m) => ({
          componentName: m.chunk.componentName,
          section: m.chunk.section,
          sourceFile: m.chunk.sourceFile,
          score: m.score,
        })),
      });
    } catch (error) {
      return upstreamFailure(c, error);
    }
  });

  app.post("/ask", async (c) => {
    const body = await c.req.json().catch(() => null);
    const question = validateQuestion(body, "question");
    if ("error" in question) return c.json({ error: question.error }, 400);

    try {
      const result = await answerQuestion(
        question.value,
        deps.index,
        deps.embeddingClient,
        deps.llmClient,
        3,
        deps.confidenceThreshold
      );
      return c.json(result);
    } catch (error) {
      return upstreamFailure(c, error);
    }
  });

  return app;
}

function requireToken(expected: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!tokensMatch(provided, expected)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}

function upstreamFailure(c: Context, error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  // The embedding-space mismatch is a deployment error (wrong index for this embedder), not a
  // transient upstream failure, so it must not be retried as a 502.
  if (message.startsWith("Vector store was built with")) {
    return c.json({ error: message }, 500);
  }
  return c.json({ error: "upstream provider failed" }, 502);
}
