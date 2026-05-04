import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolErrorCode, ToolFailure } from './types.js';

type StructuredContent = Record<string, unknown>;
type StructuredResult<T extends StructuredContent> = CallToolResult & {
  structuredContent: T;
};
type StructuredErrorResult = StructuredResult<ToolFailure> & {
  isError: true;
};

export function jsonResult<T extends StructuredContent>(value: T): StructuredResult<T> {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}

export function toolFailure(code: ToolErrorCode, message: string): StructuredErrorResult {
  return {
    ...jsonResult({
      ok: false,
      error: { code, message }
    } satisfies ToolFailure),
    isError: true
  };
}
