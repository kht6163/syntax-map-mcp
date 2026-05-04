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

describe('listSymbols', () => {
  it('extracts TypeScript symbols', async () => {
    const symbols = listSymbols(await parseFixture('sample.ts'));

    expect(symbols.map(symbol => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining([
        'interface:User',
        'type:UserId',
        'class:UserService',
        'method:findUser',
        'function:formatUser',
        'variable:defaultUser'
      ])
    );

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

    expect(symbols.map(symbol => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining([
        'class:User',
        'class:UserRepository',
        'method:find_user',
        'function:format_user',
        'variable:default_user'
      ])
    );

    expect(symbols.find(symbol => symbol.name === 'find_user')).toEqual(
      expect.objectContaining({ kind: 'method', parentName: 'UserRepository' })
    );
  });
});
