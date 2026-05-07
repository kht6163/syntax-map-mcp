import { parseSourceFile } from '../parser.js';
import type { CodeSymbol, SourceRange, SupportedLanguage, ToolFailure } from '../types.js';
import type { Workspace } from '../workspace.js';
import { findDefinitions } from './definitions.js';
import { findReferences } from './references.js';
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

type IdentifierAtPosition = {
  name: string;
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

export type LspReferencesInput = LspDefinitionInput;

export type LspReferencesResult =
  | {
      ok: true;
      path: string;
      language: SupportedLanguage;
      name: string;
      locations: LspLocation[];
    }
  | ToolFailure;

export type LspHoverInput = LspDefinitionInput;

export type LspMarkupContent = {
  kind: 'markdown';
  value: string;
};

export type LspHoverResult =
  | {
      ok: true;
      path: string;
      language: SupportedLanguage;
      name: string;
      range?: LspRange;
      contents: LspMarkupContent;
    }
  | ToolFailure;

export type LspWorkspaceSymbolsInput = {
  query: string;
  paths?: string[];
  kinds?: CodeSymbol['kind'][];
};

export type LspWorkspaceSymbol = {
  name: string;
  kind: number;
  location: LspLocation;
};

export type LspWorkspaceSymbolsResult =
  | {
      ok: true;
      query: string;
      symbols: LspWorkspaceSymbol[];
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

function identifierAt(text: string, line: number, character: number): IdentifierAtPosition | undefined {
  const sourceLine = text.split(/\r?\n/)[line] ?? '';
  const identifierPattern = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  let match: RegExpExecArray | null;

  while ((match = identifierPattern.exec(sourceLine)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (character >= start && character <= end) {
      return {
        name: match[0],
        range: {
          start: { line, character: start },
          end: { line, character: end }
        }
      };
    }
  }
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

    const identifier = identifierAt(file.text, input.line, input.character);
    const name = identifier?.name ?? '';
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

export async function getReferences(
  workspace: Workspace,
  input: LspReferencesInput
): Promise<LspReferencesResult> {
  try {
    validatePosition(input.line, input.character);

    const file = await workspace.readSourceFile(input.path);
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    if (!parsed.ok) return parsed;

    const identifier = identifierAt(file.text, input.line, input.character);
    const name = identifier?.name ?? '';
    const paths = input.paths ?? (await workspace.listSourceFiles()).map(sourceFile => sourceFile.relativePath);
    const references = name === '' ? { ok: true as const, references: [] } : await findReferences(workspace, { name, paths });
    if (!references.ok) return references;

    return {
      ok: true,
      path: file.relativePath,
      language: parsed.language,
      name,
      locations: references.references.map(reference => ({
        path: reference.path,
        range: lspRange(reference.range)
      }))
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

export async function getHover(workspace: Workspace, input: LspHoverInput): Promise<LspHoverResult> {
  try {
    validatePosition(input.line, input.character);

    const file = await workspace.readSourceFile(input.path);
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    if (!parsed.ok) return parsed;

    const identifier = identifierAt(file.text, input.line, input.character);
    const name = identifier?.name ?? '';
    const paths = input.paths ?? (await workspace.listSourceFiles()).map(sourceFile => sourceFile.relativePath);
    const definitions = name === '' ? { ok: true as const, definitions: [] } : await findDefinitions(workspace, { name, paths });
    if (!definitions.ok) return definitions;

    const definition = definitions.definitions[0];

    return {
      ok: true,
      path: file.relativePath,
      language: parsed.language,
      name,
      range: identifier?.range,
      contents: {
        kind: 'markdown',
        value: definition
          ? `**${definition.kind}** \`${name}\`\n\n\`\`\`${parsed.language}\n${definition.snippet}\n\`\`\``
          : name === ''
            ? ''
            : `\`${name}\``
      }
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

export async function getWorkspaceSymbols(
  workspace: Workspace,
  input: LspWorkspaceSymbolsInput
): Promise<LspWorkspaceSymbolsResult> {
  try {
    const symbols: LspWorkspaceSymbol[] = [];
    const query = input.query.toLocaleLowerCase();
    const kinds = input.kinds ? new Set(input.kinds) : undefined;
    const paths = input.paths ?? (await workspace.listSourceFiles()).map(sourceFile => sourceFile.relativePath);

    for (const inputPath of paths) {
      const file = await workspace.readSourceFile(inputPath);
      if (!file.ok) return file;

      const parsed = parseSourceFile(file);
      if (!parsed.ok) return parsed;

      symbols.push(
        ...listSymbols(parsed)
          .filter(symbol => symbol.name.toLocaleLowerCase().includes(query))
          .filter(symbol => !kinds || kinds.has(symbol.kind))
          .map(symbol => ({
            name: symbol.name,
            kind: SYMBOL_KIND_BY_CODE_KIND[symbol.kind],
            location: {
              path: file.relativePath,
              range: lspRange(symbol.range)
            }
          }))
      );
    }

    return {
      ok: true,
      query: input.query,
      symbols
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}
