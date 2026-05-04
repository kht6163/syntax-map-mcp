import path from 'node:path';
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
      'build_context'
    ]);
  });
});
