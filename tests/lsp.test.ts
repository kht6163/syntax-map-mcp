import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDocumentSymbols } from '../src/analysis/lsp.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('getDocumentSymbols', () => {
  it('returns LSP document symbols for a supported source file', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getDocumentSymbols(workspace, { path: 'sample.ts' });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        path: 'sample.ts',
        language: 'typescript',
        symbols: expect.arrayContaining([
          expect.objectContaining({
            name: 'UserService',
            kind: 5,
            range: {
              start: { line: 7, character: 7 },
              end: expect.objectContaining({ line: expect.any(Number), character: expect.any(Number) })
            },
            selectionRange: {
              start: { line: 7, character: 13 },
              end: { line: 7, character: 24 }
            }
          }),
          expect.objectContaining({
            name: 'formatUser',
            kind: 12
          })
        ])
      })
    );
  });

  it('propagates workspace failures', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getDocumentSymbols(workspace, { path: '../outside.ts' });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'WORKSPACE_OUTSIDE_ROOT',
        message: expect.any(String)
      }
    });
  });
});
