import Parser from 'tree-sitter';
import { languageForName } from '../languages.js';
import type { ParsedSourceFile } from '../parser.js';
import type { SourceRange } from '../types.js';

export type QueryCaptureResult = {
  name: string;
  nodeType: string;
  range: SourceRange;
  text: string;
};

export type QueryRunResult =
  | { ok: true; language: string; path: string; captures: QueryCaptureResult[] }
  | { ok: false; error: { code: 'QUERY_ERROR'; message: string } };

export function runTreeSitterQuery(parsed: ParsedSourceFile, queryText: string): QueryRunResult {
  try {
    const query = new Parser.Query(languageForName(parsed.language), queryText);
    const captures = query.captures(parsed.tree.rootNode).map(capture => ({
      name: capture.name,
      nodeType: capture.node.type,
      range: {
        start: capture.node.startPosition,
        end: capture.node.endPosition
      },
      text: capture.node.text
    }));

    return {
      ok: true,
      language: parsed.language,
      path: parsed.file.relativePath,
      captures
    };
  } catch (error) {
    /* v8 ignore next -- tree-sitter query failures throw Error instances in supported runtimes. */
    const message = error instanceof Error ? error.message : String(error);

    return {
      ok: false,
      error: {
        code: 'QUERY_ERROR',
        message
      }
    };
  }
}
