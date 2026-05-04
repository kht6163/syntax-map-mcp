import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findDefinitions } from '../src/analysis/definitions.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('findDefinitions', () => {
  it('finds definitions by symbol name across files', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const definitions = await findDefinitions(workspace, {
      name: 'UserService',
      paths: ['sample.ts', 'sample.py']
    });

    expect(definitions.ok).toBe(true);
    if (definitions.ok) {
      expect(definitions.definitions).toEqual([
        expect.objectContaining({
          path: 'sample.ts',
          name: 'UserService',
          kind: 'class'
        })
      ]);
    }
  });

  it('filters definitions by kind', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const definitions = await findDefinitions(workspace, {
      name: 'formatUser',
      kinds: ['class'],
      paths: ['sample.ts']
    });

    expect(definitions).toEqual({
      ok: true,
      definitions: []
    });
  });

  it('propagates workspace failures', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const definitions = await findDefinitions(workspace, {
      name: 'UserService',
      paths: ['missing.ts']
    });

    expect(definitions).toEqual({
      ok: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: expect.any(String)
      }
    });
  });
});
