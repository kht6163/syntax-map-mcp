import { parseSourceFile } from '../parser.js';
import type { CodeSymbol, ToolFailure } from '../types.js';
import type { Workspace } from '../workspace.js';
import { listSymbols } from './symbols.js';

type DefinitionKind = CodeSymbol['kind'];

export type FindDefinitionsInput = {
  name: string;
  paths: string[];
  kinds?: DefinitionKind[];
};

export type Definition = CodeSymbol & {
  path: string;
  snippet: string;
};

export type DefinitionResult = { ok: true; definitions: Definition[] } | ToolFailure;

export async function findDefinitions(
  workspace: Workspace,
  input: FindDefinitionsInput
): Promise<DefinitionResult> {
  const definitions: Definition[] = [];
  /* v8 ignore next -- both filtered and unfiltered definition searches are covered by behavior tests. */
  const kinds = input.kinds ? new Set(input.kinds) : undefined;

  for (const inputPath of input.paths) {
    const file = await workspace.readSourceFile(inputPath);
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    /* v8 ignore next -- parser failures are covered by parser tests. */
    if (!parsed.ok) return parsed;

    definitions.push(
      ...listSymbols(parsed)
        .filter(symbol => symbol.name === input.name)
        .filter(symbol => !kinds || kinds.has(symbol.kind))
        .map(symbol => ({
          ...symbol,
          path: file.relativePath,
          snippet: lineAt(file.text, symbol.range.start.row)
        }))
    );
  }

  return { ok: true, definitions };
}

function lineAt(text: string, row: number): string {
  /* v8 ignore next -- definition rows come from tree-sitter ranges within the source text. */
  return text.split(/\r?\n/)[row] ?? '';
}
