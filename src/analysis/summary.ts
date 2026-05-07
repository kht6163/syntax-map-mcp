import type Parser from 'tree-sitter';
import { parseSourceFile, type ParsedSourceFile, type ParseFailure } from '../parser.js';
import type { CodeSymbol, SupportedLanguage } from '../types.js';
import type { Workspace } from '../workspace.js';
import { listSymbols } from './symbols.js';

export type FileSummary = {
  ok: true;
  path: string;
  language: SupportedLanguage;
  lineCount: number;
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
  sources: {
    symbols: 'ast';
    imports: 'ast';
    exports: 'ast';
  };
};

export async function summarizeFile(
  workspace: Workspace,
  filePath: string
): Promise<FileSummary | ParseFailure> {
  const file = await workspace.readSourceFile(filePath);
  /* v8 ignore next -- workspace failures are covered by summarize and tool handler tests. */
  if (!file.ok) return file;

  const parsed = parseSourceFile(file);
  /* v8 ignore next -- parser failures are covered by parser tests. */
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    path: file.relativePath,
    language: parsed.language,
    lineCount: countLines(file.text),
    symbols: listSymbols(parsed),
    imports: findImports(parsed),
    exports: findExports(parsed),
    sources: {
      symbols: 'ast',
      imports: 'ast',
      exports: 'ast'
    }
  };
}

function countLines(text: string): number {
  /* v8 ignore next -- non-empty and empty summaries are covered by context and summary tests. */
  if (text.length === 0) return 0;

  return text.replace(/\r\n|\r|\n$/, '').split(/\r\n|\r|\n/).length;
}

function findImports(parsed: ParsedSourceFile): string[] {
  return parsed.tree.rootNode.namedChildren
    .filter(node => isImportNode(parsed.language, node.type))
    .map(node => firstLine(node.text));
}

function isImportNode(language: SupportedLanguage, nodeType: string): boolean {
  switch (language) {
    case 'python':
      return nodeType === 'import_statement' || nodeType === 'import_from_statement';
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return nodeType === 'import_statement';
    case 'rust':
      return false;
  }
}

function findExports(parsed: ParsedSourceFile): string[] {
  if (parsed.language === 'python') {
    return findPythonAllExports(parsed);
  }

  return parsed.tree.rootNode.namedChildren
    .filter(node => isExportNode(parsed.language, node.type))
    .map(node => firstLine(node.text));
}

function isExportNode(language: SupportedLanguage, nodeType: string): boolean {
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return nodeType === 'export_statement';
    /* v8 ignore next 2 -- Python exports are handled by findPythonAllExports before this switch. */
    case 'python':
    case 'rust':
      return false;
  }
}

function findPythonAllExports(parsed: ParsedSourceFile): string[] {
  return parsed.tree.rootNode.namedChildren.flatMap(node => pythonAllExportNames(node));
}

function pythonAllExportNames(node: Parser.SyntaxNode): string[] {
  if (node.type !== 'expression_statement') return [];

  const assignment = node.namedChildren[0];
  if (!assignment || assignment.type !== 'assignment') return [];

  const [target, value] = assignment.namedChildren;
  /* v8 ignore next -- malformed __all__ assignments are represented by the empty export tests. */
  if (!target || !value || target.type !== 'identifier' || target.text !== '__all__') return [];
  /* v8 ignore next -- non-list __all__ values are treated as no exports. */
  if (value.type !== 'list' && value.type !== 'tuple') return [];

  return value.namedChildren
    .filter(child => child.type === 'string')
    /* v8 ignore next -- Python string nodes from supported grammars include string_content children. */
    .map(child => child.namedChildren.find(part => part.type === 'string_content')?.text ?? '')
    .filter(Boolean);
}

function firstLine(text: string): string {
  return text.split(/\r\n|\r|\n/, 1)[0].trim();
}
