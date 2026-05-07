import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { detectLanguage, parseSourceFile } from '../src/parser.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('parser', () => {
  it.each([
    ['sample.js', 'javascript'],
    ['sample.ts', 'typescript'],
    ['sample.tsx', 'tsx'],
    ['sample.py', 'python'],
    ['sample.rs', 'rust']
  ] as const)('detects %s as %s', (fileName, expectedLanguage) => {
    expect(detectLanguage(fileName)).toEqual({ ok: true, language: expectedLanguage });
  });

  it('rejects unsupported extensions', () => {
    expect(detectLanguage('README.md')).toEqual({
      ok: false,
      error: {
        code: 'UNSUPPORTED_EXTENSION',
        message: 'Unsupported extension: .md'
      }
    });
  });

  it.each([
    ['sample.js', 'javascript', 'program'],
    ['sample.ts', 'typescript', 'program'],
    ['sample.tsx', 'tsx', 'program'],
    ['sample.py', 'python', 'module'],
    ['sample.rs', 'rust', 'source_file']
  ] as const)('parses %s as %s with %s root', async (fileName, expectedLanguage, expectedRoot) => {
    const workspace = await createWorkspace(fixtureRoot);
    const file = await workspace.readSourceFile(fileName);
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    const parsed = parseSourceFile(file);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.language).toBe(expectedLanguage);
      expect(parsed.tree.rootNode.type).toBe(expectedRoot);
    }
  });

  it('parses TypeScript files larger than the native string parse limit', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-parser-large-'));

    try {
      const declarations = Array.from({ length: 1200 }, (_, index) => `export const value${index} = ${index};`);
      await writeFile(path.join(root, 'large.ts'), `${declarations.join('\n')}\n`);
      const workspace = await createWorkspace(root);
      const file = await workspace.readSourceFile('large.ts');
      expect(file.ok).toBe(true);
      if (!file.ok) return;

      expect(file.text.length).toBeGreaterThan(32768);

      const parsed = parseSourceFile(file);

      expect(parsed).toEqual(
        expect.objectContaining({
          ok: true,
          language: 'typescript'
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns parse failures when grammar resolution throws', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const file = await workspace.readSourceFile('sample.ts');
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    const parsed = parseSourceFile(file, () => {
      throw new Error('grammar unavailable');
    });

    expect(parsed).toEqual({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'grammar unavailable'
      }
    });
  });

  it('stringifies non-Error parser failures', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const file = await workspace.readSourceFile('sample.ts');
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    const parsed = parseSourceFile(file, () => {
      throw 'grammar unavailable';
    });

    expect(parsed).toEqual({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'grammar unavailable'
      }
    });
  });
});
