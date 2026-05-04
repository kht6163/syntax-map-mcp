import Parser from 'tree-sitter';
import { languageForName } from '../languages.js';
import type { ParsedSourceFile } from '../parser.js';
import type { CodeSymbol, SourceRange } from '../types.js';

type SymbolKind = CodeSymbol['kind'];
type SymbolPattern = {
  kind: SymbolKind;
  query: string;
};

const javaScriptSymbolPatterns: SymbolPattern[] = [
  { kind: 'class', query: '(class_declaration name: (identifier) @name) @definition' },
  { kind: 'method', query: '(method_definition name: (property_identifier) @name) @definition' },
  { kind: 'function', query: '(function_declaration name: (identifier) @name) @definition' },
  { kind: 'variable', query: '(variable_declarator name: (identifier) @name) @definition' }
];

const typeScriptSymbolPatterns: SymbolPattern[] = [
  { kind: 'interface', query: '(interface_declaration name: (type_identifier) @name) @definition' },
  { kind: 'type', query: '(type_alias_declaration name: (type_identifier) @name) @definition' },
  { kind: 'class', query: '(class_declaration name: (type_identifier) @name) @definition' },
  { kind: 'method', query: '(method_definition name: (property_identifier) @name) @definition' },
  { kind: 'function', query: '(function_declaration name: (identifier) @name) @definition' },
  { kind: 'variable', query: '(variable_declarator name: (identifier) @name) @definition' }
];

const pythonSymbolPatterns: SymbolPattern[] = [
  { kind: 'class', query: '(class_definition name: (identifier) @name) @definition' },
  { kind: 'function', query: '(function_definition name: (identifier) @name) @definition' },
  { kind: 'variable', query: '(module (expression_statement (assignment left: (identifier) @name) @definition))' }
];

export function listSymbols(parsed: ParsedSourceFile): CodeSymbol[] {
  return patternsForLanguage(parsed).flatMap(pattern => querySymbols(parsed, pattern));
}

function patternsForLanguage(parsed: ParsedSourceFile): SymbolPattern[] {
  switch (parsed.language) {
    case 'javascript':
      return javaScriptSymbolPatterns;
    case 'typescript':
    case 'tsx':
      return typeScriptSymbolPatterns;
    case 'python':
      return pythonSymbolPatterns;
  }
}

function querySymbols(parsed: ParsedSourceFile, pattern: SymbolPattern): CodeSymbol[] {
  const query = new Parser.Query(languageForName(parsed.language), pattern.query);

  return query.matches(parsed.tree.rootNode).flatMap(match => {
    const name = match.captures.find(capture => capture.name === 'name')?.node;
    const definition = match.captures.find(capture => capture.name === 'definition')?.node ?? name;
    if (!name || !definition) return [];

    const kind = symbolKind(parsed, pattern.kind, definition);

    return [
      {
        name: name.text,
        kind,
        range: rangeForNode(definition),
        selectionRange: rangeForNode(name),
        parentName: parentNameForSymbol(parsed, kind, definition)
      }
    ];
  });
}

function symbolKind(
  parsed: ParsedSourceFile,
  kind: SymbolKind,
  definition: Parser.SyntaxNode
): SymbolKind {
  if (parsed.language === 'python' && kind === 'function' && findAncestor(definition, 'class_definition')) {
    return 'method';
  }

  return kind;
}

function parentNameForSymbol(
  parsed: ParsedSourceFile,
  kind: SymbolKind,
  definition: Parser.SyntaxNode
): string | undefined {
  if (kind !== 'method') return undefined;

  const classNode =
    parsed.language === 'python'
      ? findAncestor(definition, 'class_definition')
      : findAncestor(definition, 'class_declaration');

  return classNode?.childForFieldName('name')?.text;
}

function findAncestor(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | undefined {
  let current = node.parent;

  while (current) {
    if (current.type === type) return current;
    current = current.parent;
  }

  return undefined;
}

function rangeForNode(node: Parser.SyntaxNode): SourceRange {
  return {
    start: node.startPosition,
    end: node.endPosition
  };
}
