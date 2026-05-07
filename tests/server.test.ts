import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createServer, createServerInfo } from '../src/server.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('server metadata', () => {
  it('uses the package version for MCP server info', async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };

    await expect(createServerInfo()).resolves.toEqual({
      name: 'syntax-map-mcp',
      version: packageJson.version
    });
  });

  it('reports the package version in the MCP initialize response', async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };
    const server = await createServer({ workspaceRoot: fixtureRoot });
    const client = new Client({ name: 'syntax-map-mcp-test', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      expect(client.getServerVersion()).toEqual({
        name: 'syntax-map-mcp',
        version: packageJson.version
      });
    } finally {
      await client.close();
    }
  });
});
