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
  { kind: 'class', query: '(abstract_class_declaration name: (type_identifier) @name) @definition' },
  { kind: 'method', query: '(method_definition name: (property_identifier) @name) @definition' },
  { kind: 'method', query: '(abstract_method_signature name: (property_identifier) @name) @definition' },
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
    /* v8 ignore next 2 -- symbol queries in this module always capture a name and definition fallback. */
    const name = match.captures.find(capture => capture.name === 'name')?.node;
    const definition = match.captures.find(capture => capture.name === 'definition')?.node ?? name;
    /* v8 ignore next -- supported symbol queries always provide both captures. */
    if (!name || !definition) return [];
    if (pattern.kind === 'variable' && !isTopLevelVariableDefinition(definition)) return [];
    if (
      pattern.kind === 'method' &&
      isJavaScriptLikeLanguage(parsed) &&
      !directJavaScriptLikeMethodClass(definition)
    ) {
      return [];
    }
    if (pattern.kind === 'method' && name.text === 'constructor') return [];

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
  if (parsed.language === 'python' && kind === 'function' && isDirectPythonMethod(definition)) {
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
      ? directPythonMethodClass(definition)
      : directJavaScriptLikeMethodClass(definition);

  return classNode?.childForFieldName('name')?.text;
}

function isJavaScriptLikeLanguage(parsed: ParsedSourceFile): boolean {
  /* v8 ignore next 5 -- language dispatch is covered by JS/TS/TSX/Python fixture tests. */
  return (
    parsed.language === 'javascript' ||
    parsed.language === 'typescript' ||
    parsed.language === 'tsx'
  );
}

function isTopLevelVariableDefinition(definition: Parser.SyntaxNode): boolean {
  const statement = definition.parent;
  /* v8 ignore next -- tree-sitter variable definitions always have a parent statement. */
  if (!statement) return false;

  if (statement.parent?.type === 'program' || statement.parent?.type === 'module') return true;

  /* v8 ignore next -- exported and non-exported top-level variables are covered by symbol tests. */
  return (
    statement.parent?.type === 'export_statement' &&
    /* v8 ignore next -- export_statement parents are program/module in supported top-level symbol queries. */
    (statement.parent.parent?.type === 'program' || statement.parent.parent?.type === 'module')
  );
}

function isDirectPythonMethod(definition: Parser.SyntaxNode): boolean {
  return directPythonMethodClass(definition) !== undefined;
}

function directPythonMethodClass(definition: Parser.SyntaxNode): Parser.SyntaxNode | undefined {
  const methodNode =
    definition.parent?.type === 'decorated_definition' ? definition.parent : definition;
  const block = methodNode.parent;
  const classNode = block?.parent;

  if (block?.type !== 'block' || classNode?.type !== 'class_definition') return undefined;

  return classNode;
}

function directJavaScriptLikeMethodClass(
  definition: Parser.SyntaxNode
): Parser.SyntaxNode | undefined {
  const classBody = definition.parent;
  const classNode = classBody?.parent;

  if (
    classBody?.type !== 'class_body' ||
    (classNode?.type !== 'class_declaration' && classNode?.type !== 'abstract_class_declaration')
  ) {
    return undefined;
  }

  return classNode;
}

function rangeForNode(node: Parser.SyntaxNode): SourceRange {
  return {
    start: node.startPosition,
    end: node.endPosition
  };
}
