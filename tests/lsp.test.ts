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
  getSignatureHelp,
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

  it('returns LSP document symbols for a Rust source file', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getDocumentSymbols(workspace, { path: 'sample.rs' });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        path: 'sample.rs',
        language: 'rust',
        symbols: expect.arrayContaining([
          expect.objectContaining({ name: 'User', kind: 5 }),
          expect.objectContaining({ name: 'Repository', kind: 11 }),
          expect.objectContaining({ name: 'format_user', kind: 12 }),
          expect.objectContaining({ name: 'display_name', kind: 6 })
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

  it('returns Rust LSP definition locations for the identifier at a source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getDefinition(workspace, {
      path: 'sample.rs',
      line: 28,
      character: 1,
      paths: ['sample.rs']
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.rs',
      language: 'rust',
      name: 'let_default_user',
      locations: [
        {
          path: 'sample.rs',
          range: {
            start: { line: 30, character: 0 },
            end: { line: 35, character: 1 }
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

  it('returns Rust LSP reference locations for the identifier at a source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getReferences(workspace, {
      path: 'sample.rs',
      line: 28,
      character: 1,
      paths: ['sample.rs']
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        path: 'sample.rs',
        language: 'rust',
        name: 'let_default_user',
        locations: expect.arrayContaining([
          {
            path: 'sample.rs',
            range: {
              start: { line: 28, character: 0 },
              end: { line: 28, character: 16 }
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

  it('returns Rust LSP hover contents for a source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getHover(workspace, {
      path: 'sample.rs',
      line: 28,
      character: 1,
      paths: ['sample.rs']
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.rs',
      language: 'rust',
      name: 'let_default_user',
      range: {
        start: { line: 28, character: 0 },
        end: { line: 28, character: 16 }
      },
      contents: {
        kind: 'markdown',
        value: '**function** `let_default_user`\n\n```rust\nfn let_default_user() -> User {\n```'
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

  it('returns Rust LSP workspace symbols matching a query', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getWorkspaceSymbols(workspace, {
      query: 'user',
      paths: ['sample.rs']
    });

    expect(result).toEqual({
      ok: true,
      query: 'user',
      symbols: [
        expect.objectContaining({
          name: 'User',
          kind: 5,
          location: expect.objectContaining({ path: 'sample.rs' })
        }),
        expect.objectContaining({
          name: 'UserStatus',
          kind: 5,
          location: expect.objectContaining({ path: 'sample.rs' })
        }),
        expect.objectContaining({
          name: 'UserId',
          kind: 26,
          location: expect.objectContaining({ path: 'sample.rs' })
        }),
        expect.objectContaining({
          name: 'format_user',
          kind: 12,
          location: expect.objectContaining({ path: 'sample.rs' })
        }),
        expect.objectContaining({
          name: 'let_default_user',
          kind: 12,
          location: expect.objectContaining({ path: 'sample.rs' })
        }),
        expect.objectContaining({
          name: 'find_user',
          kind: 6,
          location: expect.objectContaining({ path: 'sample.rs' })
        }),
        expect.objectContaining({
          name: 'DEFAULT_USER_ID',
          kind: 13,
          location: expect.objectContaining({ path: 'sample.rs' })
        })
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

  it('returns Rust LSP completion items for the prefix at a source position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getCompletion(workspace, {
      path: 'sample.rs',
      line: 28,
      character: 3,
      paths: ['sample.rs']
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.rs',
      language: 'rust',
      prefix: 'let',
      isIncomplete: false,
      items: [
        {
          label: 'let_default_user',
          kind: 3,
          detail: 'function from sample.rs',
          sortText: 'let_default_user'
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

  it('returns LSP signature help for a function call position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getSignatureHelp(workspace, {
      path: 'sample.ts',
      line: 21,
      character: 11,
      paths: ['sample.ts']
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      name: 'formatUser',
      activeSignature: 0,
      activeParameter: 0,
      signatures: [
        {
          label: 'formatUser(user: User): string',
          parameters: [{ label: 'user: User' }]
        }
      ]
    });
  });

  it('returns Rust LSP signature help for a function call position', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getSignatureHelp(workspace, {
      path: 'sample.rs',
      line: 28,
      character: 17,
      paths: ['sample.rs']
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.rs',
      language: 'rust',
      name: 'let_default_user',
      activeSignature: 0,
      activeParameter: 0,
      signatures: [
        {
          label: 'let_default_user() -> User',
          parameters: []
        }
      ]
    });
  });

  it('tracks the active LSP signature parameter by comma position', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-lsp-signature-'));

    try {
      await writeFile(
        path.join(root, 'calls.ts'),
        ['export function pair(left: string, right: number): string { return left + right; }', 'pair("a", 1);'].join('\n')
      );
      const workspace = await createWorkspace(root);

      const result = await getSignatureHelp(workspace, {
        path: 'calls.ts',
        line: 1,
        character: 10,
        paths: ['calls.ts']
      });

      expect(result).toEqual({
        ok: true,
        path: 'calls.ts',
        language: 'typescript',
        name: 'pair',
        activeSignature: 0,
        activeParameter: 1,
        signatures: [
          {
            label: 'pair(left: string, right: number): string',
            parameters: [{ label: 'left: string' }, { label: 'right: number' }]
          }
        ]
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('handles nested calls when calculating LSP signature parameters', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-lsp-signature-nested-'));

    try {
      await writeFile(
        path.join(root, 'nested.ts'),
        [
          'export function inner(value: string): string { return value; }',
          'export function outer(left: string, right: string): string { return left + right; }',
          'outer(inner("a"), "b");'
        ].join('\n')
      );
      const workspace = await createWorkspace(root);

      const result = await getSignatureHelp(workspace, {
        path: 'nested.ts',
        line: 2,
        character: 18,
        paths: ['nested.ts']
      });

      expect(result).toEqual({
        ok: true,
        path: 'nested.ts',
        language: 'typescript',
        name: 'outer',
        activeSignature: 0,
        activeParameter: 1,
        signatures: [
          {
            label: 'outer(left: string, right: string): string',
            parameters: [{ label: 'left: string' }, { label: 'right: string' }]
          }
        ]
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns empty LSP signature help when the active call has no definition', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-lsp-signature-missing-'));

    try {
      await writeFile(path.join(root, 'missing.ts'), 'missingThing(value);\n');
      const workspace = await createWorkspace(root);

      const result = await getSignatureHelp(workspace, {
        path: 'missing.ts',
        line: 0,
        character: 13
      });

      expect(result).toEqual({
        ok: true,
        path: 'missing.ts',
        language: 'typescript',
        name: 'missingThing',
        activeSignature: undefined,
        activeParameter: undefined,
        signatures: []
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns LSP signature help for zero-parameter functions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-lsp-signature-zero-'));

    try {
      await writeFile(path.join(root, 'zero.ts'), 'export function zero(): number { return 0; }\nzero();\n');
      const workspace = await createWorkspace(root);

      const result = await getSignatureHelp(workspace, {
        path: 'zero.ts',
        line: 1,
        character: 5,
        paths: ['zero.ts']
      });

      expect(result).toEqual({
        ok: true,
        path: 'zero.ts',
        language: 'typescript',
        name: 'zero',
        activeSignature: 0,
        activeParameter: 0,
        signatures: [
          {
            label: 'zero(): number',
            parameters: []
          }
        ]
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns LSP signature help for functions without return annotations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-lsp-signature-no-return-'));

    try {
      await writeFile(path.join(root, 'plain.ts'), 'export function plain() { return 0; }\nplain();\n');
      const workspace = await createWorkspace(root);

      const result = await getSignatureHelp(workspace, {
        path: 'plain.ts',
        line: 1,
        character: 6,
        paths: ['plain.ts']
      });

      expect(result).toEqual({
        ok: true,
        path: 'plain.ts',
        language: 'typescript',
        name: 'plain',
        activeSignature: 0,
        activeParameter: 0,
        signatures: [
          {
            label: 'plain()',
            parameters: []
          }
        ]
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns LSP signature help for class methods', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-lsp-signature-method-'));

    try {
      await writeFile(
        path.join(root, 'method.ts'),
        [
          'class Box {',
          '  make(value: string): string { return value; }',
          '}',
          'const box = new Box();',
          'box.make("a");'
        ].join('\n')
      );
      const workspace = await createWorkspace(root);

      const result = await getSignatureHelp(workspace, {
        path: 'method.ts',
        line: 4,
        character: 10,
        paths: ['method.ts']
      });

      expect(result).toEqual({
        ok: true,
        path: 'method.ts',
        language: 'typescript',
        name: 'make',
        activeSignature: 0,
        activeParameter: 0,
        signatures: [
          {
            label: 'make(value: string): string',
            parameters: [{ label: 'value: string' }]
          }
        ]
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns LSP signature help for Python functions', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getSignatureHelp(workspace, {
      path: 'sample.py',
      line: 25,
      character: 12,
      paths: ['sample.py']
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.py',
      language: 'python',
      name: 'format_user',
      activeSignature: 0,
      activeParameter: 0,
      signatures: [
        {
          label: 'format_user(user: User) -> str',
          parameters: [{ label: 'user: User' }]
        }
      ]
    });
  });

  it('ignores parenthesized expressions without a callable name for signature help', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-lsp-signature-expression-'));

    try {
      await writeFile(path.join(root, 'expression.ts'), '(value);\n');
      const workspace = await createWorkspace(root);

      const result = await getSignatureHelp(workspace, {
        path: 'expression.ts',
        line: 0,
        character: 1
      });

      expect(result).toEqual({
        ok: true,
        path: 'expression.ts',
        language: 'typescript',
        name: '',
        activeSignature: undefined,
        activeParameter: undefined,
        signatures: []
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns empty LSP signature help when no call is active', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getSignatureHelp(workspace, {
      path: 'sample.ts',
      line: 20,
      character: 0
    });

    expect(result).toEqual({
      ok: true,
      path: 'sample.ts',
      language: 'typescript',
      name: '',
      activeSignature: undefined,
      activeParameter: undefined,
      signatures: []
    });
  });

  it('rejects invalid LSP signature help positions', async () => {
    const workspace = await createWorkspace(fixtureRoot);

    const result = await getSignatureHelp(workspace, {
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
});
