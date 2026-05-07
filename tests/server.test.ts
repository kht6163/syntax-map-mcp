import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createServer, createServerInfo, runServer } from '../src/server.js';

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

  it('rejects package metadata without a version string', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-mcp-server-'));
    const packageJsonPath = path.join(root, 'package.json');
    await writeFile(packageJsonPath, '{"name":"syntax-map-mcp"}\n');

    await expect(createServerInfo(packageJsonPath)).rejects.toThrow('package.json version is missing');
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

  it('starts the index watcher when auto indexing is enabled', async () => {
    const watchedRoots: string[] = [];

    await createServer(
      { workspaceRoot: fixtureRoot, autoIndex: true },
      {
        startIndexWatcher: workspace => {
          watchedRoots.push(workspace.root);
          return {
            ready: Promise.resolve(),
            flush: async () => {},
            stop: () => {}
          };
        }
      }
    );

    expect(watchedRoots).toEqual([await realpath(fixtureRoot)]);
  });

  it('can start the default index watcher when auto indexing is enabled', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-mcp-auto-index-'));

    try {
      await writeFile(path.join(workspaceRoot, 'sample.ts'), 'export function sample() {}\n');

      const server = await createServer({
        workspaceRoot,
        autoIndex: true,
        indexDebounceMs: 1
      });

      await server.close();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('stops the index watcher when the server closes', async () => {
    let stopCount = 0;
    const server = await createServer(
      { workspaceRoot: fixtureRoot, autoIndex: true },
      {
        startIndexWatcher: () => ({
          ready: Promise.resolve(),
          flush: async () => {},
          stop: () => {
            stopCount += 1;
          }
        })
      }
    );

    await server.close();

    expect(stopCount).toBe(1);
  });

  it('connects the MCP server to stdio transport', async () => {
    const calls: unknown[] = [];
    const transport = { name: 'transport' };
    const serverOptions: unknown[] = [];

    await runServer(
      { workspaceRoot: fixtureRoot },
      {
        createServer: async options => {
          serverOptions.push(options);
          return {
          connect: async connectedTransport => {
            calls.push(connectedTransport);
          }
          };
        },
        createTransport: () => transport as never
      }
    );

    expect(calls).toEqual([transport]);
    expect(serverOptions).toEqual([
      {
        workspaceRoot: fixtureRoot,
        autoIndex: true
      }
    ]);
  });

  it('uses stdio transport by default', async () => {
    const calls: unknown[] = [];

    await runServer(
      { workspaceRoot: fixtureRoot, autoIndex: false },
      {
        createServer: async () => ({
          connect: async connectedTransport => {
            calls.push(connectedTransport);
          }
        })
      }
    );

    expect(calls).toHaveLength(1);
  });
});
