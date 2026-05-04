import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findReferences } from '../src/analysis/references.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

const numericRangeShape = expect.objectContaining({
  start: expect.objectContaining({ row: expect.any(Number), column: expect.any(Number) }),
  end: expect.objectContaining({ row: expect.any(Number), column: expect.any(Number) })
});

describe('findReferences', () => {
  it('finds identifier references by name across files', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const references = await findReferences(workspace, {
      name: 'formatUser',
      paths: ['sample.ts', 'sample.js']
    });

    expect(references.ok).toBe(true);
    if (references.ok) {
      expect(references.references.length).toBeGreaterThanOrEqual(2);
      expect(references.references.every(reference => reference.name === 'formatUser')).toBe(true);
    }
  });

  it('includes path, node type, range, and snippet', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const references = await findReferences(workspace, {
      name: 'User',
      paths: ['sample.ts']
    });

    expect(references.ok).toBe(true);
    if (references.ok) {
      expect(references.references).toContainEqual(
        expect.objectContaining({
          path: 'sample.ts',
          name: 'User',
          nodeType: expect.any(String),
          range: numericRangeShape,
          snippet: expect.stringContaining('User')
        })
      );
    }
  });

  it('propagates missing file failures', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const references = await findReferences(workspace, {
      name: 'formatUser',
      paths: ['missing.ts']
    });

    expect(references).toEqual({
      ok: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: expect.any(String)
      }
    });
  });
});
