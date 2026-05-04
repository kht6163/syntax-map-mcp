import path from 'node:path';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createToolHandlers, registerTools } from '../src/tools.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

async function createHandlers() {
  return createToolHandlers(await createWorkspace(fixtureRoot));
}

describe('createToolHandlers', () => {
  it('lists symbols for a TypeScript file', async () => {
    const handlers = await createHandlers();

    const result = await handlers.listSymbols({ path: 'sample.ts' });

    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        path: 'sample.ts',
        language: 'typescript',
        symbols: expect.arrayContaining([
          expect.objectContaining({
            name: 'UserService',
            kind: 'class'
          })
        ])
      })
    );
  });

  it('returns a tool failure for invalid queries', async () => {
    const handlers = await createHandlers();

    const result = await handlers.runQuery({ path: 'sample.ts', query: '(' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: 'QUERY_ERROR',
        message: expect.any(String)
      }
    });
  });

  it('finds definitions', async () => {
    const handlers = await createHandlers();

    const result = await handlers.findDefinition({
      name: 'UserService',
      paths: ['sample.ts', 'sample.py']
    });

    expect(result.structuredContent).toEqual({
      ok: true,
      definitions: [
        expect.objectContaining({
          path: 'sample.ts',
          name: 'UserService',
          kind: 'class'
        })
      ]
    });
  });

  it('finds references', async () => {
    const handlers = await createHandlers();

    const result = await handlers.findReferences({
      name: 'formatUser',
      paths: ['sample.ts']
    });

    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        references: expect.arrayContaining([
          expect.objectContaining({
            path: 'sample.ts',
            name: 'formatUser'
          })
        ])
      })
    );
  });

  it('summarizes files', async () => {
    const handlers = await createHandlers();

    const result = await handlers.summarizeFile({ path: 'sample.ts' });

    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        path: 'sample.ts',
        language: 'typescript',
        symbols: expect.arrayContaining([
          expect.objectContaining({
            name: 'UserService'
          })
        ])
      })
    );
  });

  it('builds context markdown', async () => {
    const handlers = await createHandlers();

    const result = await handlers.buildContext({
      paths: ['sample.ts'],
      detail: 'compact'
    });

    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        markdown: expect.stringContaining('## sample.ts')
      })
    );
  });

  it('propagates workspace failures as tool failures', async () => {
    const handlers = await createHandlers();

    const result = await handlers.summarizeFile({ path: '../outside.ts' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: 'WORKSPACE_OUTSIDE_ROOT',
        message: expect.any(String)
      }
    });
  });

  it('indexes the workspace and searches symbols from SQLite', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-mcp-'));
    await cp(fixtureRoot, workspaceRoot, { recursive: true });

    try {
      const handlers = createToolHandlers(await createWorkspace(workspaceRoot));

      const indexResult = await handlers.indexWorkspace({});
      expect(indexResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          indexedFiles: expect.any(Number),
          symbols: expect.any(Number),
          references: expect.any(Number),
          indexPath: expect.stringContaining('.syntax-map-mcp/index.sqlite')
        })
      );
      expect((indexResult.structuredContent as { references: number }).references).toBeGreaterThan(0);

      const searchResult = await handlers.searchSymbols({ query: 'UserService' });
      expect(searchResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          isStale: false,
          staleFiles: 0,
          refreshed: false,
          total: 1,
          symbols: [
            expect.objectContaining({
              path: 'sample.ts',
              name: 'UserService',
              kind: 'class',
              snippet: 'export class UserService {'
            })
          ]
        })
      );

      const definitionResult = await handlers.findIndexedDefinition({ name: 'UserService' });
      expect(definitionResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          isStale: false,
          staleFiles: 0,
          refreshed: false,
          total: 1,
          definitions: [
            expect.objectContaining({
              path: 'sample.ts',
              language: 'typescript',
              name: 'UserService',
              kind: 'class',
              snippet: 'export class UserService {'
            })
          ]
        })
      );

      const definitionWithContext = await handlers.findIndexedDefinition({
        name: 'UserService',
        contextBefore: 2,
        contextAfter: 1,
        includePreview: true
      });
      expect(definitionWithContext.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          definitions: [
            expect.objectContaining({
              snippet: 'export class UserService {',
              context: {
                before: ['export type UserId = User[\'id\'];', ''],
                after: ['  constructor(private readonly users: User[]) {}']
              },
              previewMarkdown: [
                'sample.ts:8',
                '',
                '```typescript',
                "export type UserId = User['id'];",
                '',
                'export class UserService {',
                '  constructor(private readonly users: User[]) {}',
                '```'
              ].join('\n')
            })
          ]
        })
      );

      const referencesResult = await handlers.findIndexedReferences({ name: 'formatUser' });
      expect(referencesResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          isStale: false,
          staleFiles: 0,
          refreshed: false,
          total: expect.any(Number),
          references: expect.arrayContaining([
            expect.objectContaining({
              path: 'sample.ts',
              name: 'formatUser',
              nodeType: expect.any(String),
              snippet: expect.stringContaining('formatUser')
            })
          ])
        })
      );

      const indexedContextResult = await handlers.buildContext({
        detail: 'compact',
        indexedSearch: {
          query: 'UserService',
          kinds: ['class'],
          contextBefore: 1,
          contextAfter: 1
        }
      });
      expect(indexedContextResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          metadata: {
            indexedSearchMode: 'symbols',
            indexPath: expect.any(String),
            isStale: false,
            staleFiles: 0,
            refreshed: false,
            total: expect.any(Number)
          },
          markdown: expect.stringContaining('## Indexed Search Results')
        })
      );
      expect((indexedContextResult.structuredContent as { markdown: string }).markdown).toContain(
        'sample.ts:8'
      );

      const limitedContextResult = await handlers.buildContext({
        detail: 'compact',
        maxFiles: 1,
        indexedSearch: {
          query: '',
          kinds: ['class']
        }
      });
      expect((limitedContextResult.structuredContent as { markdown: string }).markdown).toContain(
        '## sample.js'
      );
      expect((limitedContextResult.structuredContent as { markdown: string }).markdown).not.toContain(
        '## sample.py'
      );

      const referenceContextResult = await handlers.buildContext({
        detail: 'compact',
        indexedSearch: {
          mode: 'references',
          name: 'formatUser',
          contextBefore: 1,
          contextAfter: 1
        }
      });
      expect(referenceContextResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          metadata: {
            indexedSearchMode: 'references',
            indexPath: expect.any(String),
            isStale: false,
            staleFiles: 0,
            refreshed: false,
            total: expect.any(Number)
          },
          markdown: expect.stringContaining('### formatUser')
        })
      );

      const statusResult = await handlers.getIndexStatus({});
      expect(statusResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          indexedFiles: expect.any(Number),
          symbols: expect.any(Number),
          references: expect.any(Number),
          staleFiles: 0
        })
      );
      expect((statusResult.structuredContent as { references: number }).references).toBeGreaterThan(
        0
      );

      const clearResult = await handlers.clearIndex({});
      expect(clearResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          cleared: true
        })
      );
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('reports stale indexed searches and refreshes on demand', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-mcp-'));
    await cp(fixtureRoot, workspaceRoot, { recursive: true });

    try {
      const handlers = createToolHandlers(await createWorkspace(workspaceRoot));
      await handlers.indexWorkspace({});

      await writeFile(
        path.join(workspaceRoot, 'sample.ts'),
        'export class RenamedService {\n  getUserName() {\n    return "Ada";\n  }\n}\n'
      );

      const staleSearch = await handlers.searchSymbols({ query: 'RenamedService' });
      expect(staleSearch.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          isStale: true,
          staleFiles: 1,
          refreshed: false,
          total: 0
        })
      );

      const refreshedSearch = await handlers.searchSymbols({
        query: 'RenamedService',
        refreshIfStale: true
      });
      expect(refreshedSearch.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          isStale: false,
          staleFiles: 0,
          refreshed: true,
          total: 1,
          symbols: [
            expect.objectContaining({
              path: 'sample.ts',
              name: 'RenamedService',
              kind: 'class'
            })
          ]
        })
      );

      const refreshedDefinition = await handlers.findIndexedDefinition({
        name: 'RenamedService',
        refreshIfStale: true
      });
      expect(refreshedDefinition.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          isStale: false,
          staleFiles: 0,
          refreshed: false,
          total: 1,
          definitions: [
            expect.objectContaining({
              path: 'sample.ts',
              name: 'RenamedService',
              snippet: 'export class RenamedService {'
            })
          ]
        })
      );

      await writeFile(
        path.join(workspaceRoot, 'sample.ts'),
        'export function renamedTarget() {\n  return "Ada";\n}\n\nrenamedTarget();\n'
      );

      const staleReferences = await handlers.findIndexedReferences({ name: 'renamedTarget' });
      expect(staleReferences.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          isStale: true,
          staleFiles: 1,
          refreshed: false,
          total: 0
        })
      );

      const refreshedReferences = await handlers.findIndexedReferences({
        name: 'renamedTarget',
        refreshIfStale: true
      });
      expect(refreshedReferences.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          isStale: false,
          staleFiles: 0,
          refreshed: true,
          references: expect.arrayContaining([
            expect.objectContaining({
              path: 'sample.ts',
              name: 'renamedTarget',
              snippet: expect.stringContaining('renamedTarget')
            })
          ])
        })
      );
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('orders indexed search results by source location', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-mcp-order-'));

    try {
      await writeFile(
        path.join(workspaceRoot, 'a.ts'),
        [
          'export class ZebraThing {}',
          'export class SharedThing {}',
          'sharedThing();'
        ].join('\n')
      );
      await writeFile(
        path.join(workspaceRoot, 'b.ts'),
        [
          'export class AlphaThing {}',
          'export class SharedThing {}',
          'sharedThing();'
        ].join('\n')
      );

      const handlers = createToolHandlers(await createWorkspace(workspaceRoot));
      await handlers.indexWorkspace({});

      const searchResult = await handlers.searchSymbols({ query: '', kinds: ['class'] });
      expect(
        (searchResult.structuredContent as { symbols: Array<{ path: string; name: string }> }).symbols.map(
          symbol => `${symbol.path}:${symbol.name}`
        )
      ).toEqual([
        'a.ts:ZebraThing',
        'a.ts:SharedThing',
        'b.ts:AlphaThing',
        'b.ts:SharedThing'
      ]);

      const definitionResult = await handlers.findIndexedDefinition({ name: 'SharedThing' });
      expect(
        (definitionResult.structuredContent as { definitions: Array<{ path: string; name: string }> }).definitions.map(
          definition => `${definition.path}:${definition.name}`
        )
      ).toEqual(['a.ts:SharedThing', 'b.ts:SharedThing']);

      const referencesResult = await handlers.findIndexedReferences({ name: 'sharedThing' });
      expect(
        (referencesResult.structuredContent as { references: Array<{ path: string; name: string }> }).references.map(
          reference => `${reference.path}:${reference.name}`
        )
      ).toEqual(['a.ts:sharedThing', 'b.ts:sharedThing']);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe('registerTools', () => {
  it('registers the public MCP tool names in snake_case', async () => {
    const registeredNames: string[] = [];
    const server = {
      registerTool(name: string) {
        registeredNames.push(name);
      }
    };

    registerTools(server as never, await createWorkspace(fixtureRoot));

    expect(registeredNames).toEqual([
      'list_symbols',
      'find_definition',
      'find_references',
      'summarize_file',
      'run_query',
      'build_context',
      'index_workspace',
      'search_symbols',
      'find_indexed_definition',
      'find_indexed_references',
      'get_index_status',
      'clear_index'
    ]);
  });
});
