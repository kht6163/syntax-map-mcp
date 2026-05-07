import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getDiagnostics,
  treeSitterDiagnosticProvider,
  type DiagnosticProvider
} from '../src/analysis/diagnostics.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('getDiagnostics', () => {
  it('returns no diagnostics for a valid source file', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getDiagnostics(workspace, { path: 'sample.ts' });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      diagnostics: []
    });
  });

  it('reports tree-sitter syntax errors as LSP diagnostics', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-diagnostics-'));

    try {
      await writeFile(path.join(workspaceRoot, 'broken.ts'), 'export function broken(\n');

      const workspace = await createWorkspace(workspaceRoot);
      const result = await getDiagnostics(workspace, { path: 'broken.ts' });

      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          path: 'broken.ts',
          language: 'typescript',
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              severity: 1,
              source: 'tree-sitter',
              message: expect.stringContaining('Syntax error'),
              range: expect.objectContaining({
                start: expect.objectContaining({
                  line: expect.any(Number),
                  character: expect.any(Number)
                }),
                end: expect.objectContaining({
                  line: expect.any(Number),
                  character: expect.any(Number)
                })
              })
            })
          ])
        })
      );
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('reports tree-sitter missing nodes as syntax diagnostics', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-diagnostics-missing-'));

    try {
      await writeFile(path.join(workspaceRoot, 'missing.ts'), 'if (true) {\n');

      const workspace = await createWorkspace(workspaceRoot);
      const result = await getDiagnostics(workspace, { path: 'missing.ts' });

      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          path: 'missing.ts',
          language: 'typescript',
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              severity: 1,
              source: 'tree-sitter',
              message: expect.stringContaining('missing')
            })
          ])
        })
      );
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('supports additional diagnostic providers for future LSP server integration', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const provider: DiagnosticProvider = {
      name: 'rust-analyzer',
      getDiagnostics: () => [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 3 }
          },
          severity: 2,
          source: 'rust-analyzer',
          message: 'example provider diagnostic'
        }
      ]
    };

    const result = await getDiagnostics(workspace, { path: 'sample.rs' }, [
      treeSitterDiagnosticProvider,
      provider
    ]);

    expect(result).toEqual({
      ok: true,
      path: 'sample.rs',
      language: 'rust',
      diagnostics: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 3 }
          },
          severity: 2,
          source: 'rust-analyzer',
          message: 'example provider diagnostic'
        }
      ]
    });
  });

  it('propagates workspace failures', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getDiagnostics(workspace, { path: '../outside.ts' });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'WORKSPACE_OUTSIDE_ROOT',
        message: expect.any(String)
      }
    });
  });
});
