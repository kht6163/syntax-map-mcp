import type { ToolFailure } from '../types.js';
import type { Workspace } from '../workspace.js';
import { summarizeFile, type FileSummary } from './summary.js';

export type BuildContextInput = {
  paths: string[];
  detail: 'compact' | 'full';
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

function renderMarkdown(summaries: FileSummary[], detail: BuildContextInput['detail']): string {
  return ['# Code Context', ...summaries.map(summary => renderFile(summary, detail))].join('\n\n');
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
