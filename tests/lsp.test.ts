import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getCompletion,
  getDefinition,
  getDocumentSymbols,
  getHover,
  getReferences,
  getWorkspaceSymbols
} from '../src/analysis/lsp.js';
import { createWorkspace } from '../src/workspace.js';
import type { Workspace } from '../src/workspace.js';

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

  it('returns an empty LSP definition result when no identifier is at the source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getDefinition(workspace, {
      path: 'sample.ts',
      line: 20,
      character: 0
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      name: '',
      locations: []
    });
  });

  it('rejects invalid LSP definition positions', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getDefinition(workspace, {
      path: 'sample.ts',
      line: -1,
      character: 0
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'line must be a non-negative integer (received -1)'
      }
    });
  });

  it('returns LSP reference locations for the identifier at a source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getReferences(workspace, {
      path: 'sample.ts',
      line: 21,
      character: 2
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        path: 'sample.ts',
        language: 'typescript',
        name: 'formatUser',
        locations: expect.arrayContaining([
          {
            path: 'sample.ts',
            range: {
              start: { line: 21, character: 0 },
              end: { line: 21, character: 10 }
            }
          }
        ])
      })
    );
  });

  it('rejects invalid LSP reference positions', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getReferences(workspace, {
      path: 'sample.ts',
      line: 21,
      character: -1
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'character must be a non-negative integer (received -1)'
      }
    });
  });

  it('returns LSP hover contents for the identifier at a source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getHover(workspace, {
      path: 'sample.ts',
      line: 21,
      character: 2
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      name: 'formatUser',
      range: {
        start: { line: 21, character: 0 },
        end: { line: 21, character: 10 }
      },
      contents: {
        kind: 'markdown',
        value: '**function** `formatUser`\n\n```typescript\nexport function formatUser(user: User): string {\n```'
      }
    });
  });

  it('returns empty LSP hover contents when no identifier is at the source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getHover(workspace, {
      path: 'sample.ts',
      line: 20,
      character: 0
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      name: '',
      contents: {
        kind: 'markdown',
        value: ''
      }
    });
  });

  it('returns fallback LSP hover contents when the identifier has no symbol definition', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getHover(workspace, {
      path: 'sample.ts',
      line: 16,
      character: 18
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      name: 'id',
      range: {
        start: { line: 16, character: 17 },
        end: { line: 16, character: 19 }
      },
      contents: {
        kind: 'markdown',
        value: '`id`'
      }
    });
  });

  it('rejects invalid LSP hover positions', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getHover(workspace, {
      path: 'sample.ts',
      line: -1,
      character: 0
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'line must be a non-negative integer (received -1)'
      }
    });
  });

  it('returns LSP workspace symbols matching a query', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getWorkspaceSymbols(workspace, { query: 'Service' });

    expect(result).toEqual({
      ok: true,
      query: 'Service',
      symbols: [
        {
          name: 'UserService',
          kind: 5,
          location: {
            path: 'sample.ts',
            range: {
              start: { line: 7, character: 7 },
              end: expect.objectContaining({ line: expect.any(Number), character: expect.any(Number) })
            }
          }
        }
      ]
    });
  });

  it('filters LSP workspace symbols by paths and kinds', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getWorkspaceSymbols(workspace, {
      query: 'user',
      paths: ['sample.ts'],
      kinds: ['function']
    });

    expect(result).toEqual({
      ok: true,
      query: 'user',
      symbols: [
        {
          name: 'formatUser',
          kind: 12,
          location: {
            path: 'sample.ts',
            range: {
              start: { line: 15, character: 7 },
              end: { line: 17, character: 1 }
            }
          }
        }
      ]
    });
  });

  it('propagates workspace failures from LSP workspace symbol paths', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getWorkspaceSymbols(workspace, {
      query: 'user',
      paths: ['missing.ts']
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: expect.any(String)
      }
    });
  });

  it('returns failures when LSP workspace symbol listing throws', async () => {
    const workspace: Workspace = {
      root: fixtureRoot,
      readSourceFile: async () => {
        throw new Error('unexpected read');
      },
      readSourceFiles: async () => [],
      listSourceFiles: async () => {
        throw new Error('cannot list files');
      }
    };

    const result = await getWorkspaceSymbols(workspace, { query: 'user' });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'cannot list files'
      }
    });
  });

  it('returns LSP completion items for the prefix at a source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getCompletion(workspace, {
      path: 'sample.ts',
      line: 21,
      character: 3,
      paths: ['sample.ts']
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      prefix: 'for',
      isIncomplete: false,
      items: [
        {
          label: 'formatUser',
          kind: 3,
          detail: 'function from sample.ts',
          sortText: 'formatUser'
        }
      ]
    });
  });

  it('filters and limits LSP completion items', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getCompletion(workspace, {
      path: 'sample.ts',
      line: 4,
      character: 0,
      paths: ['sample.ts'],
      kinds: ['class', 'function'],
      limit: 1
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      prefix: '',
      isIncomplete: false,
      items: [
        {
          label: 'UserService',
          kind: 7,
          detail: 'class from sample.ts',
          sortText: 'UserService'
        }
      ]
    });
  });

  it('uses workspace paths by default and stops completion at the limit', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getCompletion(workspace, {
      path: 'sample.ts',
      line: 4,
      character: 0,
      limit: 1
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        prefix: '',
        isIncomplete: false,
        items: [expect.objectContaining({ label: expect.any(String) })]
      })
    );
  });

  it('deduplicates LSP completion items by symbol kind and label', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-lsp-completion-dedupe-'));

    try {
      await writeFile(path.join(root, 'a.ts'), 'export function sharedThing() { return 1; }\n');
      await writeFile(path.join(root, 'b.ts'), 'export function sharedThing() { return 2; }\n');
      const workspace = await createWorkspace(root);

      const result = await getCompletion(workspace, {
        path: 'a.ts',
        line: 0,
        character: 22,
        paths: ['a.ts', 'b.ts']
      });

      expect(result).toEqual({
        ok: true,
        path: 'a.ts',
        language: 'typescript',
        prefix: 'shared',
        isIncomplete: false,
        items: [
          {
            label: 'sharedThing',
            kind: 3,
            detail: 'function from a.ts',
            sortText: 'sharedThing'
          }
        ]
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid LSP completion positions and limits', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    await expect(
      getCompletion(workspace, {
        path: 'sample.ts',
        line: -1,
        character: 0
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'line must be a non-negative integer (received -1)'
      }
    });

    await expect(
      getCompletion(workspace, {
        path: 'sample.ts',
        line: 0,
        character: 0,
        limit: 0
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'limit must be an integer between 1 and 500 (received 0)'
      }
    });
  });

  it('propagates workspace failures from LSP completion paths', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getCompletion(workspace, {
      path: 'sample.ts',
      line: 21,
      character: 3,
      paths: ['missing.ts']
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: expect.any(String)
      }
    });
  });
});
