import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

const fixtureRoot = `${process.cwd()}/tests/fixtures`;
const publicToolNames = [
  'list_symbols',
  'find_definition',
  'find_references',
  'summarize_file',
  'run_query',
  'get_ast_tree',
  'lsp_document_symbols',
  'lsp_definition',
  'lsp_references',
  'lsp_hover',
  'build_context',
  'index_workspace',
  'search_symbols',
  'find_indexed_definition',
  'find_indexed_references',
  'get_index_status',
  'clear_index'
];

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

    expect(tools.map(tool => tool.name)).toEqual(publicToolNames);
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
      get_ast_tree: {
        properties: ['path', 'maxDepth', 'includeText'],
        required: ['path']
      },
      lsp_document_symbols: { properties: ['path'], required: ['path'] },
      lsp_definition: {
        properties: ['path', 'line', 'character', 'paths'],
        required: ['path', 'line', 'character']
      },
      lsp_references: {
        properties: ['path', 'line', 'character', 'paths'],
        required: ['path', 'line', 'character']
      },
      lsp_hover: {
        properties: ['path', 'line', 'character', 'paths'],
        required: ['path', 'line', 'character']
      },
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

  it('documents every public tool in docs/tools.md', async () => {
    const markdown = await readFile('docs/tools.md', 'utf8');
    const documentedToolNames = Array.from(markdown.matchAll(/^## ([a-z_]+)$/gm), match => match[1]);

    expect(documentedToolNames).toEqual(publicToolNames);
  });
});
