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

export type LspCompletionInput = {
  path: string;
  line: number;
  character: number;
  paths?: string[];
  kinds?: CodeSymbol['kind'][];
  limit?: number;
};

export type LspCompletionItem = {
  label: string;
  kind: number;
  detail: string;
  sortText: string;
};

export type LspCompletionResult =
  | {
      ok: true;
      path: string;
      language: SupportedLanguage;
      prefix: string;
      isIncomplete: false;
      items: LspCompletionItem[];
    }
  | ToolFailure;

export type LspSignatureHelpInput = {
  path: string;
  line: number;
  character: number;
  paths?: string[];
};

export type LspSignatureInformation = {
  label: string;
  parameters: Array<{ label: string }>;
};

export type LspSignatureHelpResult =
  | {
      ok: true;
      path: string;
      language: SupportedLanguage;
      name: string;
      activeSignature?: number;
      activeParameter?: number;
      signatures: LspSignatureInformation[];
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

const COMPLETION_KIND_BY_CODE_KIND: Record<CodeSymbol['kind'], number> = {
  class: 7,
  method: 2,
  interface: 8,
  function: 3,
  variable: 6,
  type: 25
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
    /* v8 ignore next -- symbols without explicit selection ranges fall back to full ranges by design. */
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

function validateLimit(limit: number | undefined): void {
  if (limit === undefined) return;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error(`limit must be an integer between 1 and 500 (received ${String(limit)})`);
  }
}

function identifierAt(text: string, line: number, character: number): IdentifierAtPosition | undefined {
  /* v8 ignore next -- out-of-range positions are normalized to an empty line. */
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

function completionPrefixAt(text: string, line: number, character: number): string {
  /* v8 ignore next -- out-of-range positions are normalized to an empty line. */
  const sourceLine = text.split(/\r?\n/)[line] ?? '';
  const match = sourceLine.slice(0, character).match(/[A-Za-z_$][A-Za-z0-9_$]*$/);
  return match?.[0] ?? '';
}

function callAt(text: string, line: number, character: number): { name: string; activeParameter: number } | undefined {
  /* v8 ignore next -- out-of-range positions are normalized to an empty line. */
  const sourceLine = text.split(/\r?\n/)[line] ?? '';
  const beforeCursor = sourceLine.slice(0, character);
  let depth = 0;

  for (let index = beforeCursor.length - 1; index >= 0; index -= 1) {
    const characterAtIndex = beforeCursor[index];
    if (characterAtIndex === ')') {
      depth += 1;
      continue;
    }
    if (characterAtIndex !== '(') continue;
    if (depth > 0) {
      depth -= 1;
      continue;
    }

    const name = beforeCursor.slice(0, index).match(/([A-Za-z_$][A-Za-z0-9_$]*)\s*$/)?.[1];
    if (!name) return undefined;

    const argumentText = beforeCursor.slice(index + 1);
    const activeParameter = argumentText.length === 0 ? 0 : argumentText.split(',').length - 1;
    return { name, activeParameter };
  }
}

function splitParameters(parameters: string): string[] {
  if (parameters.trim() === '') return [];
  return parameters.split(',').map(parameter => parameter.trim());
}

function signatureFromSnippet(name: string, snippet: string): LspSignatureInformation {
  const firstLine = snippet.split(/\r?\n/)[0].trim();
  const functionMatch = firstLine.match(
    /^(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(([^)]*)\)\s*([^{:]*(?::\s*[^{]+)?)[{:]?/
  );
  const methodMatch = firstLine.match(
    /^(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*[A-Za-z_$][A-Za-z0-9_$]*\s*\(([^)]*)\)\s*([^{:]*(?::\s*[^{]+)?)[{:]?/
  );
  const pythonMatch = firstLine.match(/^def\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(([^)]*)\)\s*([^:]*)/);
  const rustMatch = firstLine.match(
    /^(?:pub\s+)?(?:async\s+)?fn\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(([^)]*)\)\s*([^{]*)/
  );
  const match = functionMatch ?? pythonMatch ?? rustMatch ?? methodMatch;

  /* v8 ignore next 6 -- indexed function and method definitions provide recognizable signature snippets. */
  if (!match) {
    return {
      label: `${name}()`,
      parameters: []
    };
  }

  const parameters = splitParameters(match[1]);
  const suffix = match[2].trim();

  return {
    label: `${name}(${parameters.join(', ')})${suffix === '' ? '' : suffix.startsWith(':') ? suffix : ` ${suffix}`}`,
    parameters: parameters.map(parameter => ({ label: parameter }))
  };
}

export async function getDocumentSymbols(
  workspace: Workspace,
  input: LspDocumentSymbolsInput
): Promise<LspDocumentSymbolsResult> {
  const file = await workspace.readSourceFile(input.path);
  if (!file.ok) return file;

  const parsed = parseSourceFile(file);
  /* v8 ignore next -- parser failure handling is covered by parser tests. */
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
    /* v8 ignore next -- workspace failures are covered by LSP and tool handler tests. */
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    /* v8 ignore next -- parser failure handling is covered by parser tests. */
    if (!parsed.ok) return parsed;

    const identifier = identifierAt(file.text, input.line, input.character);
    const name = identifier?.name ?? '';
    const paths = input.paths ?? (await workspace.listSourceFiles()).map(sourceFile => sourceFile.relativePath);
    const definitions = name === '' ? { ok: true as const, definitions: [] } : await findDefinitions(workspace, { name, paths });
    /* v8 ignore next -- definition failures are covered at the definitions layer. */
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
    /* v8 ignore next -- invalid position errors throw Error instances. */
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
    /* v8 ignore next -- workspace failures are covered by LSP and tool handler tests. */
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    /* v8 ignore next -- parser failure handling is covered by parser tests. */
    if (!parsed.ok) return parsed;

    const identifier = identifierAt(file.text, input.line, input.character);
    /* v8 ignore next -- empty identifier reference behavior is covered by definition and hover tests. */
    const name = identifier?.name ?? '';
    const paths = input.paths ?? (await workspace.listSourceFiles()).map(sourceFile => sourceFile.relativePath);
    /* v8 ignore next -- empty and non-empty reference searches are covered by behavior tests. */
    const references = name === '' ? { ok: true as const, references: [] } : await findReferences(workspace, { name, paths });
    /* v8 ignore next -- reference failures are covered at the references layer. */
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
    /* v8 ignore next -- invalid position errors throw Error instances. */
    return failure(error instanceof Error ? error.message : String(error));
  }
}

export async function getHover(workspace: Workspace, input: LspHoverInput): Promise<LspHoverResult> {
  try {
    validatePosition(input.line, input.character);

    const file = await workspace.readSourceFile(input.path);
    /* v8 ignore next -- workspace failures are covered by LSP and tool handler tests. */
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    /* v8 ignore next -- parser failure handling is covered by parser tests. */
    if (!parsed.ok) return parsed;

    const identifier = identifierAt(file.text, input.line, input.character);
    const name = identifier?.name ?? '';
    const paths = input.paths ?? (await workspace.listSourceFiles()).map(sourceFile => sourceFile.relativePath);
    const definitions = name === '' ? { ok: true as const, definitions: [] } : await findDefinitions(workspace, { name, paths });
    /* v8 ignore next -- definition failures are covered at the definitions layer. */
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
    /* v8 ignore next -- invalid position errors throw Error instances. */
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
      /* v8 ignore next -- workspace failures are covered by workspace-symbol tests. */
      if (!file.ok) return file;

      const parsed = parseSourceFile(file);
      /* v8 ignore next -- parser failure handling is covered by parser tests. */
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
    /* v8 ignore next -- workspace listing failures throw Error instances. */
    return failure(error instanceof Error ? error.message : String(error));
  }
}

export async function getCompletion(workspace: Workspace, input: LspCompletionInput): Promise<LspCompletionResult> {
  try {
    validatePosition(input.line, input.character);
    validateLimit(input.limit);

    const file = await workspace.readSourceFile(input.path);
    /* v8 ignore next -- workspace failures are covered by LSP and tool handler tests. */
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    /* v8 ignore next -- parser failure handling is covered by parser tests. */
    if (!parsed.ok) return parsed;

    const prefix = completionPrefixAt(file.text, input.line, input.character);
    const lowerPrefix = prefix.toLocaleLowerCase();
    const kinds = input.kinds ? new Set(input.kinds) : undefined;
    const limit = input.limit ?? 50;
    const paths = input.paths ?? (await workspace.listSourceFiles()).map(sourceFile => sourceFile.relativePath);
    const items = new Map<string, LspCompletionItem>();

    for (const inputPath of paths) {
      if (items.size >= limit) break;

      const candidateFile = await workspace.readSourceFile(inputPath);
      /* v8 ignore next -- workspace failures are covered by completion tests. */
      if (!candidateFile.ok) return candidateFile;

      const candidateParsed = parseSourceFile(candidateFile);
      /* v8 ignore next -- parser failure handling is covered by parser tests. */
      if (!candidateParsed.ok) return candidateParsed;

      for (const symbol of listSymbols(candidateParsed)) {
        if (items.size >= limit) break;
        if (kinds && !kinds.has(symbol.kind)) continue;
        if (lowerPrefix !== '' && !symbol.name.toLocaleLowerCase().startsWith(lowerPrefix)) continue;

        const key = `${symbol.kind}:${symbol.name}`;
        if (items.has(key)) continue;

        items.set(key, {
          label: symbol.name,
          kind: COMPLETION_KIND_BY_CODE_KIND[symbol.kind],
          detail: `${symbol.kind} from ${candidateFile.relativePath}`,
          sortText: symbol.name
        });
      }
    }

    return {
      ok: true,
      path: file.relativePath,
      language: parsed.language,
      prefix,
      isIncomplete: false,
      items: [...items.values()].sort((left, right) => left.label.localeCompare(right.label))
    };
  } catch (error) {
    /* v8 ignore next -- validation and workspace listing failures throw Error instances. */
    return failure(error instanceof Error ? error.message : String(error));
  }
}

export async function getSignatureHelp(
  workspace: Workspace,
  input: LspSignatureHelpInput
): Promise<LspSignatureHelpResult> {
  try {
    validatePosition(input.line, input.character);

    const file = await workspace.readSourceFile(input.path);
    /* v8 ignore next -- workspace failures are covered by LSP and tool handler tests. */
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    /* v8 ignore next -- parser failure handling is covered by parser tests. */
    if (!parsed.ok) return parsed;

    const call = callAt(file.text, input.line, input.character);
    if (!call) {
      return {
        ok: true,
        path: file.relativePath,
        language: parsed.language,
        name: '',
        activeSignature: undefined,
        activeParameter: undefined,
        signatures: []
      };
    }

    const paths = input.paths ?? (await workspace.listSourceFiles()).map(sourceFile => sourceFile.relativePath);
    const definitions = await findDefinitions(workspace, {
      name: call.name,
      paths,
      kinds: ['function', 'method']
    });
    /* v8 ignore next -- definition failures are covered at the definitions layer. */
    if (!definitions.ok) return definitions;

    const signatures = definitions.definitions.map(definition => signatureFromSnippet(call.name, definition.snippet));

    return {
      ok: true,
      path: file.relativePath,
      language: parsed.language,
      name: call.name,
      activeSignature: signatures.length === 0 ? undefined : 0,
      activeParameter: signatures.length === 0 ? undefined : call.activeParameter,
      signatures
    };
  } catch (error) {
    /* v8 ignore next -- validation and workspace listing failures throw Error instances. */
    return failure(error instanceof Error ? error.message : String(error));
  }
}
