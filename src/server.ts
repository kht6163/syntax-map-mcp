import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export type ServerOptions = {
  workspaceRoot: string;
};

export function createServer(_options: ServerOptions): McpServer {
  return new McpServer(
    { name: 'tree-sitter-code-analysis', version: '0.1.0' },
    {
      instructions:
        'Analyze JavaScript, TypeScript, and Python source files under the configured workspaceRoot only.'
    }
  );
}

export async function runServer(options: ServerOptions): Promise<void> {
  const server = createServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
