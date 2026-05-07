import { parseSourceFile } from '../parser.js';
import type { CodeSymbol, SourceRange, SupportedLanguage, ToolFailure } from '../types.js';
import type { Workspace } from '../workspace.js';
import { listSymbols } from './symbols.js';

type LspPosition = {
  line: number;
  character: number;
};

type LspRange = {
  start: LspPosition;
  end: LspPosition;
};

export type LspDocumentSymbol = {
  name: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
};

export type LspDocumentSymbolsResult =
  | {
      ok: true;
      path: string;
      language: SupportedLanguage;
      symbols: LspDocumentSymbol[];
    }
  | ToolFailure;

export type LspDocumentSymbolsInput = {
  path: string;
};

const SYMBOL_KIND_BY_CODE_KIND: Record<CodeSymbol['kind'], number> = {
  class: 5,
  method: 6,
  interface: 11,
  function: 12,
  variable: 13,
  type: 26
};

function lspRange(range: SourceRange): LspRange {
  return {
    start: {
      line: range.start.row,
      character: range.start.column
    },
    end: {
      line: range.end.row,
      character: range.end.column
    }
  };
}

function lspDocumentSymbol(symbol: CodeSymbol): LspDocumentSymbol {
  return {
    name: symbol.name,
    kind: SYMBOL_KIND_BY_CODE_KIND[symbol.kind],
    range: lspRange(symbol.range),
    selectionRange: lspRange(symbol.selectionRange ?? symbol.range)
  };
}

export async function getDocumentSymbols(
  workspace: Workspace,
  input: LspDocumentSymbolsInput
): Promise<LspDocumentSymbolsResult> {
  const file = await workspace.readSourceFile(input.path);
  if (!file.ok) return file;

  const parsed = parseSourceFile(file);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    path: file.relativePath,
    language: parsed.language,
    symbols: listSymbols(parsed).map(lspDocumentSymbol)
  };
}
