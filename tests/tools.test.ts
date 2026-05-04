import path from 'node:path';
import { cp, mkdtemp, rm } from 'node:fs/promises';
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
          indexPath: expect.stringContaining('.syntax-map-mcp/index.sqlite')
        })
      );

      const searchResult = await handlers.searchSymbols({ query: 'UserService' });
      expect(searchResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          total: 1,
          symbols: [
            expect.objectContaining({
              path: 'sample.ts',
              name: 'UserService',
              kind: 'class'
            })
          ]
        })
      );

      const definitionResult = await handlers.findIndexedDefinition({ name: 'UserService' });
      expect(definitionResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
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

      const statusResult = await handlers.getIndexStatus({});
      expect(statusResult.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          indexedFiles: expect.any(Number),
          symbols: expect.any(Number),
          staleFiles: 0
        })
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
      'get_index_status',
      'clear_index'
    ]);
  });
});
