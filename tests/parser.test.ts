import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLanguage, parseSourceFile } from '../src/parser.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('parser', () => {
  it.each([
    ['sample.js', 'javascript'],
    ['sample.ts', 'typescript'],
    ['sample.py', 'python']
  ] as const)('detects %s as %s', (fileName, expectedLanguage) => {
    expect(detectLanguage(fileName)).toEqual({ ok: true, language: expectedLanguage });
  });

  it('parses TypeScript fixture', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const file = await workspace.readSourceFile('sample.ts');
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    const parsed = parseSourceFile(file);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.language).toBe('typescript');
      expect(parsed.tree.rootNode.type).toBe('program');
    }
  });
});
