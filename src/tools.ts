import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { buildContext as buildContextAnalysis } from './analysis/context.js';
import { findDefinitions } from './analysis/definitions.js';
import {
  clearIndex as clearWorkspaceIndex,
  getIndexStatus as getWorkspaceIndexStatus,
  indexWorkspace as indexWorkspaceAnalysis,
  searchSymbols as searchIndexedSymbols
} from './analysis/index.js';
import { runTreeSitterQuery } from './analysis/query.js';
import { findReferences as findReferencesAnalysis } from './analysis/references.js';
import { summarizeFile as summarizeFileAnalysis } from './analysis/summary.js';
import { listSymbols as listParsedSymbols } from './analysis/symbols.js';
import { parseSourceFile } from './parser.js';
import { jsonResult, toolFailure } from './result.js';
import type { CodeSymbol, SupportedLanguage } from './types.js';
import type { Workspace } from './workspace.js';

type ListSymbolsInput = {
  path: string;
};

type ListSymbolsResult = {
  ok: true;
  path: string;
  language: SupportedLanguage;
  symbols: CodeSymbol[];
};

type RunQueryInput = {
  path: string;
  query: string;
};

const symbolKindSchema = z.enum(['function', 'method', 'class', 'variable', 'interface', 'type']);
const detailSchema = z.enum(['compact', 'full']);

export function createToolHandlers(workspace: Workspace) {
  return {
    async listSymbols(input: ListSymbolsInput): Promise<CallToolResult> {
      const file = await workspace.readSourceFile(input.path);
      if (!file.ok) return toolFailure(file.error.code, file.error.message);

      const parsed = parseSourceFile(file);
      if (!parsed.ok) return toolFailure(parsed.error.code, parsed.error.message);

      return jsonResult({
        ok: true,
        path: file.relativePath,
        language: parsed.language,
        symbols: listParsedSymbols(parsed)
      } satisfies ListSymbolsResult);
    },

    async findDefinition(input: {
      name: string;
      paths: string[];
      kinds?: CodeSymbol['kind'][];
    }): Promise<CallToolResult> {
      const result = await findDefinitions(workspace, input);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    },

    async findReferences(input: { name: string; paths: string[] }): Promise<CallToolResult> {
      const result = await findReferencesAnalysis(workspace, input);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    },

    async summarizeFile(input: ListSymbolsInput): Promise<CallToolResult> {
      const result = await summarizeFileAnalysis(workspace, input.path);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    },

    async runQuery(input: RunQueryInput): Promise<CallToolResult> {
      const file = await workspace.readSourceFile(input.path);
      if (!file.ok) return toolFailure(file.error.code, file.error.message);

      const parsed = parseSourceFile(file);
      if (!parsed.ok) return toolFailure(parsed.error.code, parsed.error.message);

      const result = runTreeSitterQuery(parsed, input.query);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    },

    async buildContext(input: {
      paths: string[];
      detail: 'compact' | 'full';
    }): Promise<CallToolResult> {
      const result = await buildContextAnalysis(workspace, input);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    },

    async indexWorkspace(_input: Record<string, never>): Promise<CallToolResult> {
      const result = await indexWorkspaceAnalysis(workspace);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    },

    async searchSymbols(input: {
      query: string;
      kinds?: CodeSymbol['kind'][];
      limit?: number;
    }): Promise<CallToolResult> {
      const result = await searchIndexedSymbols(workspace, input);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    },

    async getIndexStatus(_input: Record<string, never>): Promise<CallToolResult> {
      const result = await getWorkspaceIndexStatus(workspace);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    },

    async clearIndex(_input: Record<string, never>): Promise<CallToolResult> {
      const result = await clearWorkspaceIndex(workspace);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    }
  };
}

export function registerTools(server: McpServer, workspace: Workspace): void {
  const handlers = createToolHandlers(workspace);

  server.registerTool(
    'list_symbols',
    {
      title: 'List symbols',
      description: 'List top-level symbols in one supported source file.',
      inputSchema: {
        path: z.string()
      }
    },
    handlers.listSymbols
  );

  server.registerTool(
    'find_definition',
    {
      title: 'Find definition',
      description: 'Find symbol definitions by name across supported source files.',
      inputSchema: {
        name: z.string(),
        paths: z.array(z.string()),
        kinds: z.array(symbolKindSchema).optional()
      }
    },
    handlers.findDefinition
  );

  server.registerTool(
    'find_references',
    {
      title: 'Find references',
      description: 'Find identifier references by name across supported source files.',
      inputSchema: {
        name: z.string(),
        paths: z.array(z.string())
      }
    },
    handlers.findReferences
  );

  server.registerTool(
    'summarize_file',
    {
      title: 'Summarize file',
      description: 'Summarize language, line count, imports, exports, and symbols for one file.',
      inputSchema: {
        path: z.string()
      }
    },
    handlers.summarizeFile
  );

  server.registerTool(
    'run_query',
    {
      title: 'Run tree-sitter query',
      description: 'Run a tree-sitter query against one supported source file.',
      inputSchema: {
        path: z.string(),
        query: z.string()
      }
    },
    handlers.runQuery
  );

  server.registerTool(
    'build_context',
    {
      title: 'Build context',
      description: 'Build markdown context for supported source files.',
      inputSchema: {
        paths: z.array(z.string()),
        detail: detailSchema
      }
    },
    handlers.buildContext
  );

  server.registerTool(
    'index_workspace',
    {
      title: 'Index workspace',
      description: 'Build or refresh the SQLite symbol index for all supported source files.',
      inputSchema: {}
    },
    handlers.indexWorkspace
  );

  server.registerTool(
    'search_symbols',
    {
      title: 'Search indexed symbols',
      description: 'Search symbols from the SQLite workspace index.',
      inputSchema: {
        query: z.string(),
        kinds: z.array(symbolKindSchema).optional(),
        limit: z.number().int().positive().max(500).optional()
      }
    },
    handlers.searchSymbols
  );

  server.registerTool(
    'get_index_status',
    {
      title: 'Get index status',
      description: 'Return SQLite index path, indexed file count, symbol count, and stale file count.',
      inputSchema: {}
    },
    handlers.getIndexStatus
  );

  server.registerTool(
    'clear_index',
    {
      title: 'Clear index',
      description: 'Delete the SQLite workspace index file.',
      inputSchema: {}
    },
    handlers.clearIndex
  );
}
