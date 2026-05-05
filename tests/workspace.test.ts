import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
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

  it('rejects symlinks that point outside workspaceRoot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'ts-mcp-outside-'));
    const outside = path.join(outsideRoot, 'outside.ts');
    await writeFile(outside, 'export const leaked = true;');
    await symlink(outside, path.join(root, 'alias.ts'));
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile('alias.ts');

    expect(file).toEqual({
      ok: false,
      error: {
        code: 'WORKSPACE_OUTSIDE_ROOT',
        message: expect.stringContaining('outside workspaceRoot')
      }
    });
  });

  it('rejects symlinks whose target has an unsupported extension', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    await writeFile(path.join(root, 'secret.env'), 'TOKEN=secret');
    await symlink(path.join(root, 'secret.env'), path.join(root, 'alias.ts'));
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile('alias.ts');

    expect(file).toEqual({
      ok: false,
      error: {
        code: 'UNSUPPORTED_EXTENSION',
        message: expect.stringContaining('Unsupported extension')
      }
    });
  });

  it('returns FILE_NOT_FOUND for missing supported files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile('missing.ts');

    expect(file).toEqual({
      ok: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: expect.stringContaining('File not found')
      }
    });
  });

  it('returns FILE_NOT_FOUND for directories with supported-looking extensions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    await mkdir(path.join(root, 'folder.ts'));
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile('folder.ts');

    expect(file).toEqual({
      ok: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: expect.stringContaining('Not a file')
      }
    });
  });

  it('preserves readSourceFiles order with ok and failure results', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    await writeFile(path.join(root, 'first.ts'), 'export const first = 1;');
    await writeFile(path.join(root, 'notes.md'), '# notes');
    await writeFile(path.join(root, 'second.py'), 'second = 2');
    const workspace = await createWorkspace(root);

    const files = await workspace.readSourceFiles(['first.ts', 'notes.md', 'missing.ts', 'second.py']);

    expect(files).toHaveLength(4);
    expect(files[0]).toMatchObject({ ok: true, relativePath: 'first.ts' });
    expect(files[1]).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_EXTENSION' } });
    expect(files[2]).toMatchObject({ ok: false, error: { code: 'FILE_NOT_FOUND' } });
    expect(files[3]).toMatchObject({ ok: true, relativePath: 'second.py' });
  });

  it('excludes listed source files using root gitignore patterns', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    await mkdir(path.join(root, 'src'));
    await mkdir(path.join(root, 'generated'));
    await writeFile(path.join(root, '.gitignore'), ['generated/*.ts', '!generated/keep.ts'].join('\n'));
    await writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true;');
    await writeFile(path.join(root, 'generated', 'ignored.ts'), 'export const ignored = true;');
    await writeFile(path.join(root, 'generated', 'keep.ts'), 'export const keep = true;');

    const workspace = await createWorkspace(root);
    const files = await workspace.listSourceFiles();

    expect(files.map(file => file.relativePath)).toEqual(['generated/keep.ts', 'src/app.ts']);

    const explicitRead = await workspace.readSourceFile('generated/ignored.ts');
    expect(explicitRead).toMatchObject({ ok: true, relativePath: 'generated/ignored.ts' });
  });
});
