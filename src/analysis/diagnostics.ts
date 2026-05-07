import type Parser from 'tree-sitter';
import { parseSourceFile, type ParsedSourceFile, type ParseFailure } from '../parser.js';
import type { SourceRange, SupportedLanguage } from '../types.js';
import type { Workspace } from '../workspace.js';

type LspPosition = {
  line: number;
  character: number;
};

type LspRange = {
  start: LspPosition;
  end: LspPosition;
};

export type LspDiagnostic = {
  range: LspRange;
  severity: 1 | 2 | 3 | 4;
  source: string;
  message: string;
};

export type DiagnosticContext = {
  path: string;
  language: SupportedLanguage;
  text: string;
  tree: Parser.Tree;
};

export type DiagnosticProvider = {
  name: string;
  getDiagnostics(context: DiagnosticContext): LspDiagnostic[] | Promise<LspDiagnostic[]>;
};

export type LspDiagnosticsInput = {
  path: string;
};

export type LspDiagnosticsResult =
  | {
      ok: true;
      path: string;
      language: SupportedLanguage;
      diagnostics: LspDiagnostic[];
    }
  | ParseFailure;

export const treeSitterDiagnosticProvider: DiagnosticProvider = {
  name: 'tree-sitter',
  getDiagnostics(context: DiagnosticContext): LspDiagnostic[] {
    return collectTreeSitterDiagnostics(context.tree.rootNode);
  }
};

const defaultDiagnosticProviders = [treeSitterDiagnosticProvider];

export async function getDiagnostics(
  workspace: Workspace,
  input: LspDiagnosticsInput,
  providers: DiagnosticProvider[] = defaultDiagnosticProviders
): Promise<LspDiagnosticsResult> {
  const file = await workspace.readSourceFile(input.path);
  if (!file.ok) return file;

  const parsed = parseSourceFile(file);
  /* v8 ignore next -- parser failures are covered by parser tests. */
  if (!parsed.ok) return parsed;

  const context = diagnosticContext(parsed);
  const diagnostics = (
    await Promise.all(providers.map(provider => Promise.resolve(provider.getDiagnostics(context))))
  ).flat();

  return {
    ok: true,
    path: file.relativePath,
    language: parsed.language,
    diagnostics
  };
}

function diagnosticContext(parsed: ParsedSourceFile): DiagnosticContext {
  return {
    path: parsed.file.relativePath,
    language: parsed.language,
    text: parsed.file.text,
    tree: parsed.tree
  };
}

function collectTreeSitterDiagnostics(root: Parser.SyntaxNode): LspDiagnostic[] {
  if (!root.hasError) return [];

  const diagnostics: LspDiagnostic[] = [];
  collectErrorNodes(root, diagnostics);
  return diagnostics;
}

function collectErrorNodes(node: Parser.SyntaxNode, diagnostics: LspDiagnostic[]): void {
  if (node.isError || node.isMissing) {
    diagnostics.push({
      range: lspRange(rangeForNode(node)),
      severity: 1,
      source: 'tree-sitter',
      message: node.isMissing ? `Syntax error: missing ${node.type}` : 'Syntax error'
    });
  }

  if (!node.hasError) return;

  for (const child of node.children) {
    collectErrorNodes(child, diagnostics);
  }
}

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

function rangeForNode(node: Parser.SyntaxNode): SourceRange {
  return {
    start: node.startPosition,
    end: node.endPosition
  };
}
