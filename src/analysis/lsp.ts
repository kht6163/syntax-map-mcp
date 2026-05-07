import { parseSourceFile } from '../parser.js';
import type { CodeSymbol, SourceRange, SupportedLanguage, ToolFailure } from '../types.js';
import type { Workspace } from '../workspace.js';
import { findDefinitions } from './definitions.js';
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

export type LspDefinitionInput = {
  path: string;
  line: number;
  character: number;
  paths?: string[];
};

export type LspLocation = {
  path: string;
  range: LspRange;
};

export type LspDefinitionResult =
  | {
      ok: true;
      path: string;
      language: SupportedLanguage;
      name: string;
      locations: LspLocation[];
    }
  | ToolFailure;

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

function failure(message: string): ToolFailure {
  return {
    ok: false,
    error: {
      code: 'PARSE_ERROR',
      message
    }
  };
}

function validatePosition(line: number, character: number): void {
  if (!Number.isInteger(line) || line < 0) {
    throw new Error(`line must be a non-negative integer (received ${String(line)})`);
  }
  if (!Number.isInteger(character) || character < 0) {
    throw new Error(`character must be a non-negative integer (received ${String(character)})`);
  }
}

function identifierAt(text: string, line: number, character: number): string {
  const sourceLine = text.split(/\r?\n/)[line] ?? '';
  const identifierPattern = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  let match: RegExpExecArray | null;

  while ((match = identifierPattern.exec(sourceLine)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (character >= start && character <= end) {
      return match[0];
    }
  }

  return '';
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

export async function getDefinition(
  workspace: Workspace,
  input: LspDefinitionInput
): Promise<LspDefinitionResult> {
  try {
    validatePosition(input.line, input.character);

    const file = await workspace.readSourceFile(input.path);
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    if (!parsed.ok) return parsed;

    const name = identifierAt(file.text, input.line, input.character);
    const paths = input.paths ?? (await workspace.listSourceFiles()).map(sourceFile => sourceFile.relativePath);
    const definitions = name === '' ? { ok: true as const, definitions: [] } : await findDefinitions(workspace, { name, paths });
    if (!definitions.ok) return definitions;

    return {
      ok: true,
      path: file.relativePath,
      language: parsed.language,
      name,
      locations: definitions.definitions.map(definition => ({
        path: definition.path,
        range: lspRange(definition.range)
      }))
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}
