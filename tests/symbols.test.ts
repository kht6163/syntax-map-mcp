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
        range: expect.objectContaining({
          start: expect.objectContaining({ row: expect.any(Number), column: expect.any(Number) }),
          end: expect.objectContaining({ row: expect.any(Number), column: expect.any(Number) })
        })
      })
    );
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
});
