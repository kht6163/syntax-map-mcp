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
  if (!file.ok) return file;

  const parsed = parseSourceFile(file);
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
  }
}

function findExports(parsed: ParsedSourceFile): string[] {
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
    case 'python':
      return false;
  }
}

function firstLine(text: string): string {
  return text.split(/\r\n|\r|\n/, 1)[0].trim();
}
