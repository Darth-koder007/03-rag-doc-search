import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { hashingEmbeddingClient, recordingLlmClient } from "./test-support.js";
import { ingestDocs } from "../ingest/ingest.js";
import { connectPgVectorIndex, publishVectorStore } from "../store/pg-vector-index.js";
import { buildVectorStore, inMemoryIndex } from "../store/vector-store.js";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const TOKEN = "integration-token";
const FIXTURES = join(import.meta.dirname, "../../fixtures");

// Real Postgres + pgvector, real HTTP server, real ingestion of fixture components. Skipped when
// no database is configured so `pnpm test` stays runnable without Docker; CI provides one.
describe.skipIf(!DATABASE_URL)("HTTP service against Postgres", () => {
  const embeddingClient = hashingEmbeddingClient();
  const llmClient = recordingLlmClient();
  let pool: pg.Pool;
  let server: ReturnType<typeof serve>;
  let baseUrl: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const store = await buildVectorStore(ingestDocs(FIXTURES), embeddingClient);
    await publishVectorStore(pool, store);

    const index = await connectPgVectorIndex(pool);
    const app = createApp({
      index,
      embeddingClient,
      llmClient,
      apiToken: TOKEN,
      // The default 0.5 was tuned for nomic-embed-text; hashed bag-of-words scores sit lower.
      confidenceThreshold: 0.25,
      checkDatabase: async () => {
        await pool.query("SELECT 1");
      },
    });
    await new Promise<void>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0 }, (info: AddressInfo) => {
        baseUrl = `http://127.0.0.1:${info.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    server?.close();
    await pool?.end();
  });

  async function post(path: string, body: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    });
  }

  it("reports healthy with the published embedding identity", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    const body = (await response.json()) as { status: string; index: string };
    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", index: "test:hashed-bow-64" });
  });

  it("ranks chunks from Postgres in the same order as the in-memory store", async () => {
    const store = await buildVectorStore(ingestDocs(FIXTURES), embeddingClient);
    const queryVector = await embeddingClient.embed("widget props");

    const fromMemory = await inMemoryIndex(store).search(queryVector, 3);
    const fromPostgres = await (await connectPgVectorIndex(pool)).search(queryVector, 3);

    expect(fromPostgres.map((r) => r.chunk.id)).toEqual(fromMemory.map((r) => r.chunk.id));
    fromPostgres.forEach((r, i) => {
      expect(r.score).toBeCloseTo(fromMemory[i]!.score, 5);
    });
  });

  it("answers a question over HTTP with a citation to the matching component file", async () => {
    const response = await post("/ask", {
      question: "Component Widget: which props like size, scale and label does it take?",
    });
    const body = (await response.json()) as {
      grounded: boolean;
      citations: { componentName: string; sourceFile: string }[];
    };

    expect(response.status).toBe(200);
    expect(body.grounded).toBe(true);
    expect(body.citations[0]!.componentName).toBe("Widget");
  });

  it("refuses an out-of-scope question without calling the LLM", async () => {
    const callsBefore = llmClient.calls;
    const response = await post("/ask", { question: "zebra quantum harmonica" });
    const body = (await response.json()) as { grounded: boolean };

    expect(body.grounded).toBe(false);
    expect(llmClient.calls).toBe(callsBefore);
  });

  it("serves the previous index when a publish fails partway", async () => {
    const poisoned = await buildVectorStore(ingestDocs(FIXTURES), embeddingClient);
    poisoned.entries.push({ ...poisoned.entries[0]!, vector: [1, 2, 3] });

    await expect(publishVectorStore(pool, poisoned)).rejects.toThrow();

    const response = await post("/ask", {
      question: "Component Widget: which props like size, scale and label does it take?",
    });
    expect(response.status).toBe(200);
  });
});
