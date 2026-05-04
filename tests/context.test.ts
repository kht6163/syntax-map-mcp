import path from 'node:path';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/analysis/context.js';
import { indexWorkspace } from '../src/analysis/index.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');
const sampleLineCount = 22;

describe('buildContext', () => {
  it('builds compact markdown context for files', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const context = await buildContext(workspace, {
      paths: ['sample.ts', 'sample.py'],
      detail: 'compact'
    });

    expect(context.ok).toBe(true);
    if (context.ok) {
      expect(context.markdown.startsWith('# Code Context')).toBe(true);
      expect(context.markdown).toContain('## sample.ts');
      expect(context.markdown).toContain('- Language: typescript');
      expect(context.markdown).toContain(`- Lines: ${sampleLineCount}`);
      expect(context.markdown).toContain('- class UserService (8:8)');
      expect(context.markdown).toContain('- method UserService.findUser (11:3)');
      expect(context.markdown).toContain('- function format_user (21:1)');
      expect(context.markdown).not.toContain('### Imports');
      expect(context.markdown).not.toContain('### Exports');
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

  it('builds markdown context from indexed search results', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-context-index-'));
    await cp(fixtureRoot, workspaceRoot, { recursive: true });

    try {
      const workspace = await createWorkspace(workspaceRoot);
      await indexWorkspace(workspace);

      const context = await buildContext(workspace, {
        detail: 'compact',
        indexedSearch: {
          query: 'UserService',
          kinds: ['class'],
          contextBefore: 1,
          contextAfter: 1
        }
      });

      expect(context.ok).toBe(true);
      if (context.ok) {
        expect(context).toEqual(
          expect.objectContaining({
            metadata: {
              indexedSearchMode: 'symbols',
              indexPath: expect.any(String),
              isStale: false,
              staleFiles: 0,
              refreshed: false,
              total: expect.any(Number)
            }
          })
        );
        expect(context.markdown).toContain('## Indexed Search Results');
        expect(context.markdown).toContain('### UserService');
        expect(context.markdown).toContain('sample.ts:8');
        expect(context.markdown).toContain('```typescript');
        expect(context.markdown).toContain('export class UserService {');
        expect(context.markdown).toContain('## sample.ts');
      }
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('builds markdown context from indexed reference results', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-context-references-'));
    await cp(fixtureRoot, workspaceRoot, { recursive: true });

    try {
      const workspace = await createWorkspace(workspaceRoot);
      await indexWorkspace(workspace);

      const context = await buildContext(workspace, {
        detail: 'compact',
        indexedSearch: {
          mode: 'references',
          name: 'formatUser',
          contextBefore: 1,
          contextAfter: 1
        }
      });

      expect(context.ok).toBe(true);
      if (context.ok) {
        expect(context).toEqual(
          expect.objectContaining({
            metadata: {
              indexedSearchMode: 'references',
              indexPath: expect.any(String),
              isStale: false,
              staleFiles: 0,
              refreshed: false,
              total: expect.any(Number)
            }
          })
        );
        expect(context.markdown).toContain('## Indexed Search Results');
        expect(context.markdown).toContain('### formatUser');
        expect(context.markdown).toContain('sample.ts:');
        expect(context.markdown).toContain('```typescript');
        expect(context.markdown).toContain('formatUser');
        expect(context.markdown).toContain('## sample.ts');
      }
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
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
