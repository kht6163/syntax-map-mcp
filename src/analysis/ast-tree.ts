import type Parser from 'tree-sitter';
import { parseSourceFile } from '../parser.js';
import type { SourceRange, SupportedLanguage, ToolFailure } from '../types.js';
import type { Workspace } from '../workspace.js';

export type AstTreeNode = {
  type: string;
  named: boolean;
  range: SourceRange;
  childCount: number;
  children: AstTreeNode[];
  text?: string;
};

export type AstTreeResult =
  | {
      ok: true;
      path: string;
      language: SupportedLanguage;
      tree: {
        root: AstTreeNode;
      };
    }
  | ToolFailure;

export type AstTreeInput = {
  path: string;
  maxDepth?: number;
  includeText?: boolean;
};

const DEFAULT_MAX_DEPTH = 3;
const MAX_AST_DEPTH = 20;

function failure(message: string): ToolFailure {
  return {
    ok: false,
    error: {
      code: 'PARSE_ERROR',
      message
    }
  };
}

function validateMaxDepth(maxDepth: number | undefined): void {
  if (maxDepth === undefined) return;
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_AST_DEPTH) {
    throw new Error(`maxDepth must be an integer between 0 and ${MAX_AST_DEPTH} (received ${String(maxDepth)})`);
  }
}

function rangeForNode(node: Parser.SyntaxNode): SourceRange {
  return {
    start: {
      row: node.startPosition.row,
      column: node.startPosition.column
    },
    end: {
      row: node.endPosition.row,
      column: node.endPosition.column
    }
  };
}

function serializeNode(
  node: Parser.SyntaxNode,
  depth: number,
  maxDepth: number,
  includeText: boolean
): AstTreeNode {
  const result: AstTreeNode = {
    type: node.type,
    named: node.isNamed,
    range: rangeForNode(node),
    childCount: node.childCount,
    children: depth >= maxDepth ? [] : node.children.map(child => serializeNode(child, depth + 1, maxDepth, includeText))
  };

  if (includeText) {
    result.text = node.text;
  }

  return result;
}

export async function getAstTree(workspace: Workspace, input: AstTreeInput): Promise<AstTreeResult> {
  try {
    validateMaxDepth(input.maxDepth);

    const file = await workspace.readSourceFile(input.path);
    if (!file.ok) return file;

    const parsed = parseSourceFile(file);
    if (!parsed.ok) return parsed;

    return {
      ok: true,
      path: file.relativePath,
      language: parsed.language,
      tree: {
        root: serializeNode(parsed.tree.rootNode, 0, input.maxDepth ?? DEFAULT_MAX_DEPTH, input.includeText ?? false)
      }
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}
