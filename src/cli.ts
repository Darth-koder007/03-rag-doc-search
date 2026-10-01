#!/usr/bin/env node
import { Command } from "commander";
import { ingestDocs } from "./ingest/ingest.js";
import { createEmbeddingClient } from "./embeddings/create-embedding-client.js";
import { createLlmClient } from "./llm/create-client.js";
import { buildVectorStore, loadVectorStore, saveVectorStore } from "./store/vector-store.js";
import { answerQuestion } from "./answer.js";

const DEFAULT_STORE_PATH = ".docsearch-store.json";

const program = new Command();
program.name("docsearch").description("Natural-language Q&A over a design system's real docs");

program
  .command("build")
  .argument("<docsRoot>", "directory of component .tsx/.stories.tsx source to ingest")
  .option("--out <path>", "where to save the built vector store", DEFAULT_STORE_PATH)
  .action(async (docsRoot: string, options: { out: string }) => {
    const embeddingClient = createEmbeddingClient();
    const chunks = ingestDocs(docsRoot);
    console.log(`Ingested ${chunks.length} chunks. Embedding with ${embeddingClient.model}...`);
    const store = await buildVectorStore(chunks, embeddingClient);
    saveVectorStore(store, options.out);
    console.log(`Saved vector store to ${options.out} (${store.entries.length} entries).`);
  });

program
  .command("ask")
  .argument("<question>", "a natural-language question about the design system")
  .option("--store <path>", "path to a built vector store", DEFAULT_STORE_PATH)
  .action(async (question: string, options: { store: string }) => {
    const embeddingClient = createEmbeddingClient();
    const llmClient = createLlmClient();
    const store = loadVectorStore(options.store);

    const result = await answerQuestion(question, store, embeddingClient, llmClient);

    console.log(`\n${result.answer}\n`);
    if (result.citations.length > 0) {
      console.log("Sources:");
      for (const citation of result.citations) {
        console.log(`  - ${citation.componentName} (${citation.section}) — ${citation.sourceFile}`);
      }
    }
  });

program.parse();
