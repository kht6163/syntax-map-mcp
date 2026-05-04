import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarizeFile } from '../src/analysis/summary.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('summarizeFile', () => {
  it('summarizes file structure', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const summary = await summarizeFile(workspace, 'sample.ts');

    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.path).toBe('sample.ts');
      expect(summary.language).toBe('typescript');
      expect(summary.symbols.map(symbol => symbol.name)).toContain('UserService');
      expect(summary.lineCount).toBeGreaterThan(1);
    }
  });

  it('includes import and export lines', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const summary = await summarizeFile(workspace, 'sample.js');

    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.imports).toEqual(["import path from 'node:path';"]);
      expect(summary.exports).toEqual([
        'export class FileReporter {',
        'export function makeReporter() {'
      ]);
    }
  });

  it('propagates failures from invalid paths', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const summary = await summarizeFile(workspace, 'missing.ts');

    expect(summary).toEqual({
      ok: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: 'File not found: missing.ts'
      }
    });
  });
});
