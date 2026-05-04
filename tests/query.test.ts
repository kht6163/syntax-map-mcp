import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runTreeSitterQuery } from '../src/analysis/query.js';
import { parseSourceFile } from '../src/parser.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('runTreeSitterQuery', () => {
  it('returns captures for a valid query', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const file = await workspace.readSourceFile('sample.py');
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    const parsed = parseSourceFile(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = runTreeSitterQuery(parsed, '(function_definition name: (identifier) @name)');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.captures.map(capture => capture.text)).toContain('format_user');
    }
  });

  it('returns structured failure for an invalid query', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const file = await workspace.readSourceFile('sample.ts');
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    const parsed = parseSourceFile(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = runTreeSitterQuery(parsed, '(');

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'QUERY_ERROR',
        message: expect.any(String)
      }
    });
  });
});
