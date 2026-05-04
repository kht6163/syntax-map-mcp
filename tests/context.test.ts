import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/analysis/context.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('buildContext', () => {
  it('builds compact markdown context for files', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const context = await buildContext(workspace, {
      paths: ['sample.ts', 'sample.py'],
      detail: 'compact'
    });

    expect(context.ok).toBe(true);
    if (context.ok) {
      expect(context.markdown).toContain('## sample.ts');
      expect(context.markdown).toContain('class UserService');
      expect(context.markdown).toContain('function format_user');
    }
  });

  it('includes imports and exports for full detail', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const context = await buildContext(workspace, {
      paths: ['sample.js'],
      detail: 'full'
    });

    expect(context.ok).toBe(true);
    if (context.ok) {
      expect(context.markdown).toContain('### Imports');
      expect(context.markdown).toContain("- import path from 'node:path';");
      expect(context.markdown).toContain('### Exports');
      expect(context.markdown).toContain('- export class FileReporter {');
      expect(context.markdown).toContain('- export function makeReporter() {');
    }
  });

  it('propagates failures from invalid paths', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const context = await buildContext(workspace, {
      paths: ['missing.ts'],
      detail: 'compact'
    });

    expect(context).toEqual({
      ok: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: 'File not found: missing.ts'
      }
    });
  });
});
