import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/workspace.js';

describe('workspace', () => {
  it('reads files inside workspaceRoot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    await writeFile(path.join(root, 'sample.ts'), 'export const value = 1;');
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile('sample.ts');

    expect(file.ok).toBe(true);
    if (file.ok) {
      expect(file.relativePath).toBe('sample.ts');
      expect(file.text).toContain('value');
    }
  });

  it('rejects paths outside workspaceRoot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    const outside = path.join(await realpath(tmpdir()), 'outside.ts');
    await writeFile(outside, 'export const leaked = true;');
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile(outside);

    expect(file).toEqual({
      ok: false,
      error: {
        code: 'WORKSPACE_OUTSIDE_ROOT',
        message: expect.stringContaining('outside workspaceRoot')
      }
    });
  });

  it('rejects unsupported extensions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    await writeFile(path.join(root, 'notes.md'), '# notes');
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile('notes.md');

    expect(file).toEqual({
      ok: false,
      error: {
        code: 'UNSUPPORTED_EXTENSION',
        message: expect.stringContaining('Unsupported extension')
      }
    });
  });
});
