import path from 'node:path';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { createToolHandlers, registerTools } from '../src/tools.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

async function writeLegacyIndexWithoutSchemaVersion(workspaceRoot: string, filePath: string) {
  const workspace = await createWorkspace(workspaceRoot);
  const fileInfo = (await workspace.listSourceFiles()).find(file => file.relativePath === filePath);
  if (!fileInfo) throw new Error(`Fixture file not found: ${filePath}`);

  const SQL = await initSqlJs();
  const database = new SQL.Database();
  database.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY,
      language TEXT,
      size INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      parse_status TEXT NOT NULL,
      error_message TEXT,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      language TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      parent_name TEXT,
      start_row INTEGER NOT NULL,
      start_column INTEGER NOT NULL,
      end_row INTEGER NOT NULL,
      end_column INTEGER NOT NULL,
      selection_start_row INTEGER,
      selection_start_column INTEGER,
      selection_end_row INTEGER,
      selection_end_column INTEGER
    );

    CREATE TABLE reference_captures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      language TEXT NOT NULL,
      name TEXT NOT NULL,
      node_type TEXT NOT NULL,
      start_row INTEGER NOT NULL,
      start_column INTEGER NOT NULL,
      end_row INTEGER NOT NULL,
      end_column INTEGER NOT NULL
    );
  `);
  database.run(
    `
      INSERT INTO files (path, language, size, mtime_ms, parse_status, error_message, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [fileInfo.relativePath, 'typescript', fileInfo.size, fileInfo.mtimeMs, 'ok', null, new Date().toISOString()]
  );

  const indexPath = path.join(workspaceRoot, '.syntax-map-mcp', 'index.sqlite');
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, Buffer.from(database.export()));
  database.close();
}

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
          schemaVersion: 1,
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
            total: expect.any(Number),
            summarizedFiles: 1,
            omittedFiles: 0
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
            total: expect.any(Number),
            summarizedFiles: 1,
            omittedFiles: 0
          },
          markdown: expect.stringContaining('### formatUser')
        })
      );

      const statusResult = await handlers.getIndexStatus({});
      expect(statusResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          indexedFiles: expect.any(Number),
          schemaVersion: 1,
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

  it('reports stale reasons for changed and missing indexed files', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-mcp-stale-reasons-'));
    await cp(fixtureRoot, workspaceRoot, { recursive: true });

    try {
      const handlers = createToolHandlers(await createWorkspace(workspaceRoot));
      await handlers.indexWorkspace({});

      await writeFile(path.join(workspaceRoot, 'sample.ts'), 'export const changed = true;\n');
      await rm(path.join(workspaceRoot, 'sample.py'), { force: true });

      const status = await handlers.getIndexStatus({});

      expect(status.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          staleFiles: 2,
          staleReasons: expect.arrayContaining([
            {
              path: 'sample.py',
              reason: 'missing'
            },
            {
              path: 'sample.ts',
              reason: 'changed'
            }
          ])
        })
      );
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('rebuilds indexes that do not store the current schema version', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-mcp-legacy-index-'));
    await cp(fixtureRoot, workspaceRoot, { recursive: true });

    try {
      await writeLegacyIndexWithoutSchemaVersion(workspaceRoot, 'sample.ts');
      const handlers = createToolHandlers(await createWorkspace(workspaceRoot));

      const result = await handlers.searchSymbols({
        query: 'UserService',
        refreshIfStale: true
      });

      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          isStale: false,
          staleFiles: 0,
          refreshed: true,
          symbols: [
            expect.objectContaining({
              path: 'sample.ts',
              name: 'UserService',
              kind: 'class'
            })
          ]
        })
      );

      const status = await handlers.getIndexStatus({});
      expect(status.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          schemaVersion: 1,
          staleFiles: 0
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
