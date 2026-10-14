import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { hashingEmbeddingClient, recordingLlmClient } from "./test-support.js";
import { buildVectorStore, inMemoryIndex } from "../store/vector-store.js";
import type { Chunk } from "../types.js";

const TOKEN = "test-token";

function chunk(componentName: string, text: string): Chunk {
  return { id: `${componentName}:api`, componentName, section: "api", sourceFile: "x.tsx", text };
}

async function appWithButton(options: { checkDatabase?: () => Promise<void> } = {}) {
  const embeddingClient = hashingEmbeddingClient();
  const store = await buildVectorStore(
    [chunk("Button", "Button component props variant size disabled onClick")],
    embeddingClient
  );
  const llmClient = recordingLlmClient();
  const app = createApp({
    index: inMemoryIndex(store),
    embeddingClient,
    llmClient,
    apiToken: TOKEN,
    ...options,
  });
  return { app, llmClient };
}

function post(path: string, body: unknown, token: string | null = TOKEN) {
  return {
    path,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
  };
}

describe("API", () => {
  it("rejects requests without a bearer token", async () => {
    const { app } = await appWithButton();
    const { path, init } = post("/ask", { question: "button props" }, null);
    expect((await app.request(path, init)).status).toBe(401);
  });

  it("rejects requests with the wrong bearer token", async () => {
    const { app } = await appWithButton();
    const { path, init } = post("/search", { query: "button props" }, "wrong");
    expect((await app.request(path, init)).status).toBe(401);
  });

  it("answers an in-scope question with citations and calls the LLM once", async () => {
    const { app, llmClient } = await appWithButton();
    const { path, init } = post("/ask", { question: "button component props variant size" });
    const response = await app.request(path, init);
    const body = (await response.json()) as { grounded: boolean; citations: unknown[] };

    expect(response.status).toBe(200);
    expect(body.grounded).toBe(true);
    expect(body.citations).toHaveLength(1);
    expect(llmClient.calls).toBe(1);
  });

  it("returns the fixed no-documentation answer without calling the LLM when nothing matches", async () => {
    const { app, llmClient } = await appWithButton();
    const { path, init } = post("/ask", { question: "zebra quantum harmonica" });
    const response = await app.request(path, init);
    const body = (await response.json()) as { grounded: boolean; citations: unknown[] };

    expect(response.status).toBe(200);
    expect(body.grounded).toBe(false);
    expect(body.citations).toEqual([]);
    expect(llmClient.calls).toBe(0);
  });

  it("returns ranked matches with scores from /search", async () => {
    const { app } = await appWithButton();
    const { path, init } = post("/search", { query: "button props", k: 1 });
    const body = (await (await app.request(path, init)).json()) as {
      matches: { componentName: string; score: number }[];
    };

    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]!.componentName).toBe("Button");
    expect(body.matches[0]!.score).toBeGreaterThan(0);
  });

  it.each([
    ["missing question", {}],
    ["blank question", { question: "   " }],
    ["non-string question", { question: 42 }],
    ["over-length question", { question: "x".repeat(501) }],
  ])("returns 400 for %s", async (_name, body) => {
    const { app } = await appWithButton();
    const { path, init } = post("/ask", body);
    expect((await app.request(path, init)).status).toBe(400);
  });

  it("returns 400 for an out-of-range k", async () => {
    const { app } = await appWithButton();
    const { path, init } = post("/search", { query: "button", k: 50 });
    expect((await app.request(path, init)).status).toBe(400);
  });

  it("returns 400 for a body that is not JSON", async () => {
    const { app } = await appWithButton();
    const response = await app.request("/ask", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: "not json",
    });
    expect(response.status).toBe(400);
  });

  it("reports ok on /healthz without a token", async () => {
    const { app } = await appWithButton();
    const response = await app.request("/healthz");
    expect(response.status).toBe(200);
  });

  it("reports 503 on /healthz when the database check fails", async () => {
    const { app } = await appWithButton({
      checkDatabase: async () => {
        throw new Error("connection refused");
      },
    });
    expect((await app.request("/healthz")).status).toBe(503);
  });

  it("returns 500, not a wrong answer, when the index was built with a different embedding model", async () => {
    const embeddingClient = hashingEmbeddingClient();
    const store = await buildVectorStore([chunk("Button", "Button props")], {
      ...embeddingClient,
      model: "other-model",
    });
    const app = createApp({
      index: inMemoryIndex(store),
      embeddingClient,
      llmClient: recordingLlmClient(),
      apiToken: TOKEN,
    });
    const { path, init } = post("/ask", { question: "button props" });
    expect((await app.request(path, init)).status).toBe(500);
  });
});
