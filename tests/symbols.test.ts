import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSymbols } from '../src/analysis/symbols.js';
import { parseSourceFile } from '../src/parser.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

async function parseFixture(fileName: string) {
  const workspace = await createWorkspace(fixtureRoot);
  const file = await workspace.readSourceFile(fileName);
  expect(file.ok).toBe(true);
  if (!file.ok) throw new Error(file.error.message);
  const parsed = parseSourceFile(file);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed;
}

function parseInline(relativePath: string, text: string) {
  const parsed = parseSourceFile({
    ok: true,
    absolutePath: path.join(fixtureRoot, relativePath),
    relativePath,
    text
  });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed;
}

function symbolLabels(symbols: ReturnType<typeof listSymbols>) {
  return symbols
    .map(symbol => `${symbol.kind}:${symbol.name}`)
    .sort((left, right) => left.localeCompare(right));
}

const numericRangeShape = expect.objectContaining({
  start: expect.objectContaining({ row: expect.any(Number), column: expect.any(Number) }),
  end: expect.objectContaining({ row: expect.any(Number), column: expect.any(Number) })
});

describe('listSymbols', () => {
  it('extracts TypeScript symbols', async () => {
    const symbols = listSymbols(await parseFixture('sample.ts'));

    expect(symbolLabels(symbols)).toEqual([
      'class:UserService',
      'function:formatUser',
      'interface:User',
      'method:findUser',
      'type:UserId',
      'variable:defaultUser'
    ]);

    expect(symbols.find(symbol => symbol.name === 'UserService')).toEqual(
      expect.objectContaining({
        kind: 'class',
        range: numericRangeShape,
        selectionRange: numericRangeShape
      })
    );
  });

  it('extracts JavaScript symbols', async () => {
    const symbols = listSymbols(await parseFixture('sample.js'));

    expect(symbolLabels(symbols)).toEqual([
      'class:FileReporter',
      'function:makeReporter',
      'method:report',
      'variable:reporter'
    ]);
  });

  it('extracts TSX symbols', async () => {
    const symbols = listSymbols(await parseFixture('sample.tsx'));

    expect(symbolLabels(symbols)).toEqual(['function:UserCard']);
  });

  it('extracts Python symbols', async () => {
    const symbols = listSymbols(await parseFixture('sample.py'));

    expect(symbolLabels(symbols)).toEqual([
      'class:User',
      'class:UserRepository',
      'function:format_user',
      'method:__init__',
      'method:find_user',
      'variable:default_user'
    ]);

    expect(symbols.find(symbol => symbol.name === 'find_user')).toEqual(
      expect.objectContaining({ kind: 'method', parentName: 'UserRepository' })
    );
  });

  it('extracts Rust symbols', async () => {
    const symbols = listSymbols(await parseFixture('sample.rs'));

    expect(symbolLabels(symbols)).toEqual([
      'class:User',
      'class:UserStatus',
      'function:format_user',
      'function:let_default_user',
      'interface:Repository',
      'method:display_name',
      'method:find_user',
      'type:UserId',
      'variable:DEFAULT_USER_ID'
    ]);

    expect(symbols.find(symbol => symbol.name === 'display_name')).toEqual(
      expect.objectContaining({ kind: 'method', parentName: 'User' })
    );
    expect(symbols.find(symbol => symbol.name === 'find_user')).toEqual(
      expect.objectContaining({ kind: 'method', parentName: 'Repository' })
    );
  });

  it('excludes Rust extern signatures from method symbols', () => {
    const symbols = listSymbols(
      parseInline(
        'ffi.rs',
        `extern "C" {
    fn ffi_call();
}
`
      )
    );

    expect(symbols).toEqual([]);
  });

  it('classifies nested Python functions as functions', () => {
    const symbols = listSymbols(
      parseInline(
        'nested.py',
        `class Container:
    def method(self):
        def helper():
            return 1
        return helper()
`
      )
    );

    expect(symbolLabels(symbols)).toEqual([
      'class:Container',
      'function:helper',
      'method:method'
    ]);
    expect(symbols.find(symbol => symbol.name === 'method')).toEqual(
      expect.objectContaining({ kind: 'method', parentName: 'Container' })
    );
    expect(symbols.find(symbol => symbol.name === 'helper')).toEqual(
      expect.objectContaining({ kind: 'function', parentName: undefined })
    );
  });

  it('extracts TypeScript abstract classes and methods', () => {
    const symbols = listSymbols(
      parseInline(
        'abstract.ts',
        `export abstract class BaseService {
  abstract run(): void;
}
`
      )
    );

    expect(symbolLabels(symbols)).toEqual(['class:BaseService', 'method:run']);
    expect(symbols.find(symbol => symbol.name === 'run')).toEqual(
      expect.objectContaining({ kind: 'method', parentName: 'BaseService' })
    );
  });

  it('classifies decorated Python class functions as methods', () => {
    const symbols = listSymbols(
      parseInline(
        'decorated.py',
        `class Factory:
    @classmethod
    def make(cls):
        return cls()
`
      )
    );

    expect(symbolLabels(symbols)).toEqual(['class:Factory', 'method:make']);
    expect(symbols.find(symbol => symbol.name === 'make')).toEqual(
      expect.objectContaining({ kind: 'method', parentName: 'Factory' })
    );
  });

  it('excludes TypeScript object literal methods from class method symbols', () => {
    const symbols = listSymbols(
      parseInline(
        'object-methods.ts',
        `class C {
  m() {
    const helper = { run() { return 1; } };
    return helper.run();
  }
}
const obj = { top() { return 2; } };
`
      )
    );

    expect(symbolLabels(symbols)).toEqual(['class:C', 'method:m', 'variable:obj']);
  });

  it('excludes local TypeScript variables', () => {
    const symbols = listSymbols(
      parseInline(
        'local.ts',
        `export function outer() {
  const localValue = 1;
  return localValue;
}
`
      )
    );

    expect(symbolLabels(symbols)).toEqual(['function:outer']);
  });

  it('extracts exported TypeScript variables', () => {
    const symbols = listSymbols(
      parseInline(
        'exported-variable.ts',
        `export const exportedValue = 1;
`
      )
    );

    expect(symbolLabels(symbols)).toEqual(['variable:exportedValue']);
  });
});
