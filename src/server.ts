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

type ServerTransport = Parameters<McpServer['connect']>[0];
type ServerConnector = {
  connect(transport: ServerTransport): Promise<void>;
};

type RunServerDependencies = {
  createServer?: (options: ServerOptions) => Promise<ServerConnector>;
  createTransport?: () => ServerTransport;
};

function defaultPackageJsonPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
}

export async function createServerInfo(packageJsonPath = defaultPackageJsonPath()): Promise<Implementation> {
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
        'Analyze JavaScript, TypeScript, Python, and Rust source files under the configured workspaceRoot only.'
    }
  );

  registerTools(server, workspace);
  return server;
}

export async function runServer(options: ServerOptions, dependencies: RunServerDependencies = {}): Promise<void> {
  /* v8 ignore next 2 -- default CLI wiring is exercised by the package smoke test in a child process. */
  const server = await (dependencies.createServer ?? createServer)(options);
  const transport = (dependencies.createTransport ?? (() => new StdioServerTransport()))();
  await server.connect(transport);
}
