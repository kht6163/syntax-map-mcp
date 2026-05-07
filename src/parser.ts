import path from 'node:path';
import Parser from 'tree-sitter';
import { languageForName } from './languages.js';
import type { SupportedLanguage } from './types.js';
import type { SourceFile, WorkspaceFailure } from './workspace.js';

export type ParsedSourceFile = {
  ok: true;
  file: SourceFile;
  language: SupportedLanguage;
  tree: Parser.Tree;
};

export type ParseFailure =
  | WorkspaceFailure
  | {
      ok: false;
      error: {
        code: 'UNSUPPORTED_EXTENSION' | 'PARSE_ERROR';
        message: string;
      };
    };

export type LanguageDetectionResult =
  | {
      ok: true;
      language: SupportedLanguage;
    }
  | {
      ok: false;
      error: {
        code: 'UNSUPPORTED_EXTENSION';
        message: string;
      };
	    };

type LanguageResolver = (language: SupportedLanguage) => unknown;
const PARSE_CHUNK_SIZE = 4096;

export function detectLanguage(filePath: string): LanguageDetectionResult {
  const extension = path.extname(filePath);

  switch (extension) {
    case '.js':
    case '.jsx':
      return { ok: true, language: 'javascript' };
    case '.ts':
      return { ok: true, language: 'typescript' };
    case '.tsx':
      return { ok: true, language: 'tsx' };
    case '.py':
      return { ok: true, language: 'python' };
    case '.rs':
      return { ok: true, language: 'rust' };
    default:
      return {
        ok: false,
        error: {
          code: 'UNSUPPORTED_EXTENSION',
          message: `Unsupported extension: ${extension}`
        }
      };
  }
}

export function parseSourceFile(
  file: SourceFile,
  resolveLanguage: LanguageResolver = languageForName
): ParsedSourceFile | ParseFailure {
  const detected = detectLanguage(file.absolutePath);
  if (!detected.ok) return detected;

  try {
    const parser = new Parser();
    parser.setLanguage(resolveLanguage(detected.language));
    const tree = parser.parse(offset => file.text.slice(offset, offset + PARSE_CHUNK_SIZE));

    return {
      ok: true,
      file,
      language: detected.language,
      tree
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message
      }
    };
  }
}
