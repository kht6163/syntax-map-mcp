import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

const fixtureRoot = `${process.cwd()}/tests/fixtures`;

async function listPublicTools() {
  const server = await createServer({ workspaceRoot: fixtureRoot });
  const client = new Client({ name: 'syntax-map-mcp-schema-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
  }
}

describe('MCP tool schema', () => {
  it('exposes the public tool names through listTools', async () => {
    const tools = await listPublicTools();

    expect(tools.map(tool => tool.name)).toEqual([
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

  it('exposes the expected input schema fields through listTools', async () => {
    const tools = await listPublicTools();
    const toolsByName = new Map(tools.map(tool => [tool.name, tool]));

    const expectations: Record<string, { properties: string[]; required?: string[] }> = {
      list_symbols: { properties: ['path'], required: ['path'] },
      find_definition: { properties: ['name', 'paths', 'kinds'], required: ['name', 'paths'] },
      find_references: { properties: ['name', 'paths'], required: ['name', 'paths'] },
      summarize_file: { properties: ['path'], required: ['path'] },
      run_query: { properties: ['path', 'query'], required: ['path', 'query'] },
      build_context: { properties: ['paths', 'detail', 'maxFiles', 'indexedSearch'], required: ['detail'] },
      index_workspace: { properties: [] },
      search_symbols: {
        properties: [
          'query',
          'kinds',
          'limit',
          'refreshIfStale',
          'contextBefore',
          'contextAfter',
          'includePreview'
        ],
        required: ['query']
      },
      find_indexed_definition: {
        properties: [
          'name',
          'kinds',
          'limit',
          'refreshIfStale',
          'contextBefore',
          'contextAfter',
          'includePreview'
        ],
        required: ['name']
      },
      find_indexed_references: {
        properties: ['name', 'limit', 'refreshIfStale', 'contextBefore', 'contextAfter', 'includePreview'],
        required: ['name']
      },
      get_index_status: { properties: [] },
      clear_index: { properties: [] }
    };

    for (const [name, expectation] of Object.entries(expectations)) {
      const tool = toolsByName.get(name);
      expect(tool, name).toBeDefined();
      expect(Object.keys(tool?.inputSchema.properties ?? {}), name).toEqual(expectation.properties);
      expect(tool?.inputSchema.required ?? [], name).toEqual(expectation.required ?? []);
    }
  });
});
