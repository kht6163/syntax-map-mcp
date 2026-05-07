import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { summarizeFile } from '../src/analysis/summary.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');
const sampleLineCount = 22;

describe('summarizeFile', () => {
  it('summarizes file structure', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const summary = await summarizeFile(workspace, 'sample.ts');

    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.path).toBe('sample.ts');
      expect(summary.language).toBe('typescript');
      expect(summary.symbols.map(symbol => symbol.name)).toContain('UserService');
      expect(summary.lineCount).toBe(sampleLineCount);
      expect(summary.sources).toEqual({
        symbols: 'ast',
        imports: 'ast',
        exports: 'ast'
      });
    }
  });

  it('counts files without a trailing newline', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tree-sitter-summary-'));

    try {
      await writeFile(path.join(workspaceRoot, 'no-newline.ts'), 'const first = 1;\nconst second = 2;');

      const workspace = await createWorkspace(workspaceRoot);
      const summary = await summarizeFile(workspace, 'no-newline.ts');

      expect(summary.ok).toBe(true);
      if (summary.ok) {
        expect(summary.lineCount).toBe(2);
      }
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
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

  it('excludes function-local lazy imports from file imports', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tree-sitter-summary-imports-'));

    try {
      await writeFile(
        path.join(workspaceRoot, 'parsers.py'),
        [
          'import os',
          '',
          'def load_one():',
          '    from src.crawler import native_parsers as _native_pkg',
          '    return _native_pkg',
          '',
          'def load_two():',
          '    from src.crawler import native_parsers as _native_pkg',
          '    return _native_pkg'
        ].join('\n')
      );

      const workspace = await createWorkspace(workspaceRoot);
      const summary = await summarizeFile(workspace, 'parsers.py');

      expect(summary.ok).toBe(true);
      if (summary.ok) {
        expect(summary.imports).toEqual(['import os']);
      }
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('excludes non-export text from file exports', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tree-sitter-summary-exports-'));

    try {
      await writeFile(
        path.join(workspaceRoot, 'messages.ts'),
        [
          'const message = `',
          'export fakeDeclaration',
          '`;',
          '',
          'export { message };'
        ].join('\n')
      );

      const workspace = await createWorkspace(workspaceRoot);
      const summary = await summarizeFile(workspace, 'messages.ts');

      expect(summary.ok).toBe(true);
      if (summary.ok) {
        expect(summary.exports).toEqual(['export { message };']);
      }
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('uses top-level Python __all__ as exports', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tree-sitter-summary-python-exports-'));

    try {
      await writeFile(
        path.join(workspaceRoot, 'api.py'),
        [
          'class PublicService:',
          '    pass',
          '',
          'def public_helper():',
          '    return None',
          '',
          '__all__ = ["PublicService", "public_helper"]',
          '',
          'def configure():',
          '    __all__ = ["LocalOnly"]'
        ].join('\n')
      );

      const workspace = await createWorkspace(workspaceRoot);
      const summary = await summarizeFile(workspace, 'api.py');

      expect(summary.ok).toBe(true);
      if (summary.ok) {
        expect(summary.exports).toEqual(['PublicService', 'public_helper']);
      }
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('summarizes Rust symbols without imports or exports', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const summary = await summarizeFile(workspace, 'sample.rs');

    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.language).toBe('rust');
      expect(summary.imports).toEqual([]);
      expect(summary.exports).toEqual([]);
      expect(summary.symbols.map(symbol => symbol.name)).toContain('User');
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
