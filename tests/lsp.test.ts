import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDefinition, getDocumentSymbols } from '../src/analysis/lsp.js';
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

  it('returns LSP locations for the identifier at a source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getDefinition(workspace, {
      path: 'sample.ts',
      line: 21,
      character: 2
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      name: 'formatUser',
      locations: [
        {
          path: 'sample.ts',
          range: {
            start: { line: 15, character: 7 },
            end: { line: 17, character: 1 }
          }
        }
      ]
    });
  });
});
