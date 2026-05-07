import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAstTree } from '../src/analysis/ast-tree.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('getAstTree', () => {
  it('returns a depth-limited AST tree for a supported source file', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getAstTree(workspace, { path: 'sample.ts', maxDepth: 1 });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        path: 'sample.ts',
        language: 'typescript',
        tree: {
          root: expect.objectContaining({
            type: 'program',
            named: true,
            childCount: expect.any(Number),
            range: {
              start: { row: 0, column: 0 },
              end: expect.objectContaining({ row: expect.any(Number), column: expect.any(Number) })
            },
            children: expect.arrayContaining([
              expect.objectContaining({
                type: 'export_statement',
                named: true,
                children: []
              })
            ])
          })
        }
      })
    );
  });

  it('includes node text only when requested', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const withoutText = await getAstTree(workspace, { path: 'sample.py', maxDepth: 0 });
    const withText = await getAstTree(workspace, {
      path: 'sample.py',
      maxDepth: 0,
      includeText: true
    });

    expect(withoutText.ok).toBe(true);
    expect(withText.ok).toBe(true);
    if (!withoutText.ok || !withText.ok) return;

    expect(withoutText.tree.root).not.toHaveProperty('text');
    expect(withText.tree.root).toEqual(
      expect.objectContaining({
        type: 'module',
        text: expect.stringContaining('class User')
      })
    );
  });

  it('rejects invalid maxDepth values', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getAstTree(workspace, { path: 'sample.ts', maxDepth: 21 });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'maxDepth must be an integer between 0 and 20 (received 21)'
      }
    });
  });
});
