import { parseSourceFile } from '../parser.js';
import type { SourceRange, ToolFailure } from '../types.js';
import type { Workspace } from '../workspace.js';
import { runTreeSitterQuery } from './query.js';

export type FindReferencesInput = {
  name: string;
  paths: string[];
};

export type Reference = {
  path: string;
  name: string;
  nodeType: string;
  range: SourceRange;
  snippet: string;
};

export type ReferenceResult = { ok: true; references: Reference[] } | ToolFailure;

export async function findReferences(
  workspace: Workspace,
  input: FindReferencesInput
): Promise<ReferenceResult> {
  const references: Reference[] = [];

  for (const inputPath of input.paths) {
    const file = await workspace.readSourceFile(inputPath);
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    if (!parsed.ok) return parsed;

    const query = runTreeSitterQuery(parsed, referenceQueryForLanguage(parsed.language));
    if (!query.ok) return query;

    references.push(
      ...query.captures
        .filter(capture => capture.text === input.name)
        .map(capture => ({
          path: file.relativePath,
          name: capture.text,
          nodeType: capture.nodeType,
          range: capture.range,
          snippet: lineAt(file.text, capture.range.start.row)
        }))
    );
  }

  return { ok: true, references };
}

export function referenceQueryForLanguage(language: string): string {
  switch (language) {
    case 'typescript':
    case 'tsx':
      return '[(identifier) (type_identifier) (property_identifier)] @reference';
    case 'javascript':
      return '[(identifier) (property_identifier)] @reference';
    case 'python':
    default:
      return '(identifier) @reference';
  }
}

function lineAt(text: string, row: number): string {
  return text.split(/\r?\n/)[row] ?? '';
}
