import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseComponentApi } from "./parse-component.js";
import { parseComponentUsage } from "./parse-story.js";
import type { Chunk } from "../types.js";

/**
 * Walks a directory of component source (`Button.tsx`, `Button.stories.tsx`, ...) and produces
 * one "api" chunk per component plus one "usage" chunk per component that has a stories file —
 * semantically meaningful units (a whole prop table, a whole set of usage examples), never a
 * fixed-size text window that could split either mid-row.
 */
export function ingestDocs(docsRoot: string): Chunk[] {
  const files = readdirSync(docsRoot);
  const componentFiles = files.filter(
    (f) => f.endsWith(".tsx") && !f.endsWith(".stories.tsx") && !f.endsWith(".test.tsx")
  );

  const chunks: Chunk[] = [];
  for (const file of componentFiles) {
    const componentName = file.replace(/\.tsx$/, "");
    chunks.push(parseComponentApi(componentName, join(docsRoot, file)));

    const storyFile = `${componentName}.stories.tsx`;
    if (files.includes(storyFile)) {
      chunks.push(parseComponentUsage(componentName, join(docsRoot, storyFile)));
    }
  }

  return chunks;
}
