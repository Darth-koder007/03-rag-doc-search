import { ingestDocs } from "./ingest.js";

const docsRoot = process.argv[2];
if (!docsRoot) {
  console.error("Usage: pnpm ingest <path-to-component-source-dir>");
  process.exit(1);
}

const chunks = ingestDocs(docsRoot);
const byComponent = new Map<string, string[]>();
for (const chunk of chunks) {
  const sections = byComponent.get(chunk.componentName) ?? [];
  sections.push(chunk.section);
  byComponent.set(chunk.componentName, sections);
}

for (const [componentName, sections] of [...byComponent.entries()].sort()) {
  console.log(`${componentName}: ${sections.join(", ")}`);
}
console.log(`\n${byComponent.size} components, ${chunks.length} chunks total.`);
