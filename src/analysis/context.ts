import type { CodeSymbol, ToolFailure } from '../types.js';
import type { Workspace } from '../workspace.js';
import { searchSymbols } from './index.js';
import { summarizeFile, type FileSummary } from './summary.js';

export type BuildContextInput = {
  paths?: string[];
  detail: 'compact' | 'full';
  indexedSearch?: {
    query: string;
    kinds?: CodeSymbol['kind'][];
    limit?: number;
    refreshIfStale?: boolean;
    contextBefore?: number;
    contextAfter?: number;
  };
};

export type BuildContextResult =
  | {
      ok: true;
      markdown: string;
    }
  | ToolFailure;

export async function buildContext(
  workspace: Workspace,
  input: BuildContextInput
): Promise<BuildContextResult> {
  if (input.indexedSearch) {
    return buildIndexedSearchContext(workspace, {
      detail: input.detail,
      indexedSearch: input.indexedSearch
    });
  }

  if (!input.paths) {
    return failure('Either paths or indexedSearch must be provided');
  }

  const summaries: FileSummary[] = [];

  for (const filePath of input.paths) {
    const summary = await summarizeFile(workspace, filePath);
    if (!summary.ok) return summary;
    summaries.push(summary);
  }

  return {
    ok: true,
    markdown: renderMarkdown(summaries, input.detail)
  };
}

async function buildIndexedSearchContext(
  workspace: Workspace,
  input: BuildContextInput & { indexedSearch: NonNullable<BuildContextInput['indexedSearch']> }
): Promise<BuildContextResult> {
  const search = await searchSymbols(workspace, {
    ...input.indexedSearch,
    includePreview: true
  });
  if (!search.ok) return search;

  const paths = [...new Set(search.symbols.map(symbol => symbol.path))];
  const summaries: FileSummary[] = [];

  for (const filePath of paths) {
    const summary = await summarizeFile(workspace, filePath);
    if (!summary.ok) return summary;
    summaries.push(summary);
  }

  return {
    ok: true,
    markdown: renderMarkdown(summaries, input.detail, renderIndexedSearchResults(search.symbols))
  };
}

function renderMarkdown(
  summaries: FileSummary[],
  detail: BuildContextInput['detail'],
  intro?: string
): string {
  return ['# Code Context', intro, ...summaries.map(summary => renderFile(summary, detail))]
    .filter(Boolean)
    .join('\n\n');
}

function renderIndexedSearchResults(
  symbols: Array<{ name: string; previewMarkdown?: string; path: string }>
): string {
  const lines = ['## Indexed Search Results'];

  if (symbols.length === 0) {
    lines.push('', '- None');
    return lines.join('\n');
  }

  for (const symbol of symbols) {
    lines.push('', `### ${symbol.name}`, '', symbol.previewMarkdown ?? symbol.path);
  }

  return lines.join('\n');
}

function failure(message: string): ToolFailure {
  return {
    ok: false,
    error: {
      code: 'INDEX_ERROR',
      message
    }
  };
}

function renderFile(summary: FileSummary, detail: BuildContextInput['detail']): string {
  const lines = [
    `## ${summary.path}`,
    '',
    `- Language: ${summary.language}`,
    `- Lines: ${summary.lineCount}`,
    '',
    '### Symbols',
    ...renderSymbols(summary)
  ];

  if (detail === 'full') {
    if (summary.imports.length > 0) {
      lines.push('', '### Imports', ...summary.imports.map(line => `- ${line}`));
    }

    if (summary.exports.length > 0) {
      lines.push('', '### Exports', ...summary.exports.map(line => `- ${line}`));
    }
  }

  return lines.join('\n');
}

function renderSymbols(summary: FileSummary): string[] {
  if (summary.symbols.length === 0) return ['- None'];

  return summary.symbols.map(symbol => {
    const row = symbol.range.start.row + 1;
    const column = symbol.range.start.column + 1;
    const name =
      symbol.kind === 'method' && symbol.parentName ? `${symbol.parentName}.${symbol.name}` : symbol.name;
    return `- ${symbol.kind} ${name} (${row}:${column})`;
  });
}
