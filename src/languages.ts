import { createRequire } from 'node:module';
import type { SupportedLanguage } from './types.js';

const require = createRequire(import.meta.url);

type Grammar = {
  language: unknown;
};

type TypeScriptGrammars = {
  typescript: Grammar;
  tsx: Grammar;
};

const javascript = require('tree-sitter-javascript') as Grammar;
const python = require('tree-sitter-python') as Grammar;
const rust = require('tree-sitter-rust') as Grammar;
const typescript = require('tree-sitter-typescript') as TypeScriptGrammars;

const languages: Record<SupportedLanguage, unknown> = {
  javascript,
  typescript: typescript.typescript,
  tsx: typescript.tsx,
  python,
  rust
};

export function languageForName(language: SupportedLanguage): unknown {
  return languages[language];
}
