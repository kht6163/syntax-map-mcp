import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';
import { createWorkspace } from './workspace.js';

export type ServerOptions = {
  workspaceRoot: string;
};

export async function createServerInfo(): Promise<Implementation> {
  const packageJsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version?: unknown };

  if (typeof packageJson.version !== 'string') {
    throw new Error('package.json version is missing');
  }

  return {
    name: 'syntax-map-mcp',
    version: packageJson.version
  };
}

export async function createServer(options: ServerOptions): Promise<McpServer> {
  const workspace = await createWorkspace(options.workspaceRoot);
  const server = new McpServer(
    await createServerInfo(),
    {
      instructions:
        'Analyze JavaScript, TypeScript, and Python source files under the configured workspaceRoot only.'
    }
  );

  registerTools(server, workspace);
  return server;
}

export async function runServer(options: ServerOptions): Promise<void> {
  const server = await createServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
