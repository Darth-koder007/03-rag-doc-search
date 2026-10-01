import { Project, SyntaxKind } from "ts-morph";
import type { Chunk } from "../types.js";

/**
 * Parses a `.stories.tsx` file into one usage-example chunk: the Storybook meta title (if
 * present) plus each named story's `args` or custom `render`. These are real, concrete usage
 * examples (not synthesized prose) — the closest thing Project 0 has to a "how do I use this"
 * doc, since it never had a separate MDX docs layer.
 */
export function parseComponentUsage(componentName: string, sourceFilePath: string): Chunk {
  const project = new Project({ useInMemoryFileSystem: false, skipFileDependencyResolution: true });
  const sourceFile = project.addSourceFileAtPath(sourceFilePath);

  const lines: string[] = [`Usage examples for ${componentName}`, ""];

  const defaultExport = sourceFile
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getType().getText().includes("Meta"));
  const metaObject = defaultExport?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  const titleProp = metaObject
    ?.getProperty("title")
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer()
    ?.getText();
  if (titleProp) lines.push(`Storybook title: ${titleProp}`, "");

  const storyDeclarations = sourceFile
    .getVariableStatements()
    .filter((stmt) => stmt.isExported())
    .flatMap((stmt) => stmt.getDeclarations())
    .filter((decl) => decl !== defaultExport);

  for (const decl of storyDeclarations) {
    const obj = decl.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) continue;

    const name = decl.getName();
    const argsProp = obj
      .getProperty("args")
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.getText();
    const renderProp = obj
      .getProperty("render")
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.getText();

    if (renderProp) {
      lines.push(`Story "${name}" — custom render:`, renderProp, "");
    } else if (argsProp) {
      lines.push(`Story "${name}": args = ${argsProp}`);
    } else {
      lines.push(`Story "${name}" (no args)`);
    }
  }

  return {
    id: `${componentName}:usage`,
    componentName,
    section: "usage",
    sourceFile: sourceFilePath,
    text: lines.join("\n").trim(),
  };
}
