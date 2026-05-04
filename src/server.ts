import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';
import { createWorkspace } from './workspace.js';

export type ServerOptions = {
  workspaceRoot: string;
};

export async function createServer(options: ServerOptions): Promise<McpServer> {
  const workspace = await createWorkspace(options.workspaceRoot);
  const server = new McpServer(
    { name: 'syntax-map-mcp', version: '0.1.0' },
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
