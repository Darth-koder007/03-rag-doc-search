import { Project, SyntaxKind } from "ts-morph";
import type { Chunk } from "../types.js";

interface JsDocLike {
  getDescription(): string;
  getTags(): { getTagName(): string; getCommentText(): string | undefined }[];
}

function jsDocText(node: { getJsDocs(): JsDocLike[] }): string | undefined {
  const parts = node.getJsDocs().flatMap((doc) => {
    const description = doc.getDescription().trim();
    const tagTexts = doc
      .getTags()
      .map((tag) => {
        const comment = tag.getCommentText()?.trim();
        return comment ? `${tag.getTagName()}: ${comment}` : undefined;
      })
      .filter((text): text is string => Boolean(text));
    return [description, ...tagTexts].filter(Boolean);
  });
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/**
 * Parses a component's `.tsx` source for its exported type shape: standalone type aliases
 * (`export type ButtonSize = ...`) and the props interface's members, each with its JSDoc
 * comment if present (e.g. `@deprecated` notes). This is the real prop-API content a RAG
 * answer should cite, not a synthesized description — see PLAN.md's M3.1 entry for why there's
 * no separate MDX doc layer to parse instead (Project 0 never wrote one).
 */
export function parseComponentApi(componentName: string, sourceFilePath: string): Chunk {
  const project = new Project({ useInMemoryFileSystem: false, skipFileDependencyResolution: true });
  const sourceFile = project.addSourceFileAtPath(sourceFilePath);

  const lines: string[] = [`Component: ${componentName}`, ""];

  const typeAliases = sourceFile.getTypeAliases().filter((t) => t.isExported());
  for (const alias of typeAliases) {
    lines.push(
      `type ${alias.getName()} = ${alias.getTypeNode()?.getText() ?? alias.getType().getText()}`
    );
  }
  if (typeAliases.length > 0) lines.push("");

  const interfaces = sourceFile.getInterfaces().filter((i) => i.isExported());
  for (const iface of interfaces) {
    const extendsClauses = iface
      .getHeritageClauses()
      .flatMap((clause) => clause.getTypeNodes().map((t) => t.getText()));
    const typeParams = iface.getTypeParameters().map((p) => p.getText());
    const nameWithGenerics =
      typeParams.length > 0 ? `${iface.getName()}<${typeParams.join(", ")}>` : iface.getName();
    const header =
      extendsClauses.length > 0
        ? `interface ${nameWithGenerics} (extends ${extendsClauses.join(", ")}):`
        : `interface ${nameWithGenerics}:`;
    lines.push(header);

    for (const prop of iface.getProperties()) {
      const optional = prop.hasQuestionToken() ? "?" : "";
      const typeText = prop.getTypeNode()?.getText() ?? prop.getType().getText();
      const doc = jsDocText(prop);
      lines.push(`- ${prop.getName()}${optional}: ${typeText}${doc ? ` — ${doc}` : ""}`);
    }
    lines.push("");
  }

  const componentDoc = sourceFile
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((decl) => decl.getName() === componentName);
  if (componentDoc) {
    const doc = jsDocText(componentDoc.getFirstAncestorByKindOrThrow(SyntaxKind.VariableStatement));
    if (doc) lines.push(doc, "");
  }

  return {
    id: `${componentName}:api`,
    componentName,
    section: "api",
    sourceFile: sourceFilePath,
    text: lines.join("\n").trim(),
  };
}
