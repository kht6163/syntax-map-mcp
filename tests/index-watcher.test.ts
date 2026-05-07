import type { FSWatcher } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchSymbols } from '../src/analysis/index.js';
import { startIndexWatcher, type WatchFactory } from '../src/analysis/index-watcher.js';
import { createWorkspace } from '../src/workspace.js';

type WatchListener = Parameters<WatchFactory>[2];

function createManualWatchFactory(): {
  events: Array<{ root: string; options: { recursive: boolean } }>;
  emit(eventType: string, filename: string): void;
  closeCount(): number;
  watchFactory: WatchFactory;
} {
  let listener: WatchListener | undefined;
  let closed = 0;
  const events: Array<{ root: string; options: { recursive: boolean } }> = [];

  return {
    events,
    emit(eventType: string, filename: string) {
      listener?.(eventType, filename);
    },
    closeCount() {
      return closed;
    },
    watchFactory(root, options, nextListener) {
      events.push({ root, options });
      listener = nextListener;

      return {
        close() {
          closed += 1;
        },
        unref() {
          return this;
        }
      } as FSWatcher;
    }
  };
}

describe('startIndexWatcher', () => {
  it('builds an initial index and refreshes it after supported file changes', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-'));

    try {
      await writeFile(path.join(workspaceRoot, 'sample.ts'), 'export function first() {}\n');
      const workspace = await createWorkspace(workspaceRoot);
      const manualWatch = createManualWatchFactory();
      const watcher = startIndexWatcher(workspace, {
        debounceMs: 1,
        watchFactory: manualWatch.watchFactory
      });

      await watcher.ready;

      expect(manualWatch.events).toEqual([
        {
          root: workspace.root,
          options: { recursive: true }
        }
      ]);
      await expect(searchSymbols(workspace, { query: 'first' })).resolves.toMatchObject({
        ok: true,
        total: 1
      });

      await writeFile(path.join(workspaceRoot, 'sample.ts'), 'export function second() {}\n');
      manualWatch.emit('change', 'sample.ts');
      await watcher.flush();

      await expect(searchSymbols(workspace, { query: 'second' })).resolves.toMatchObject({
        ok: true,
        total: 1,
        isStale: false
      });
      await expect(searchSymbols(workspace, { query: 'first' })).resolves.toMatchObject({
        ok: true,
        total: 0,
        isStale: false
      });

      watcher.stop();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('uses node fs.watch when no watch factory is provided', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-default-'));

    try {
      const workspace = await createWorkspace(workspaceRoot);
      let refreshes = 0;
      const watcher = startIndexWatcher(workspace, {
        indexWorkspace: async () => {
          refreshes += 1;
          return {
            ok: true,
            indexPath: path.join(workspace.root, '.syntax-map-mcp', 'index.sqlite'),
            indexedFiles: 0,
            skippedFiles: 0,
            removedFiles: 0,
            schemaVersion: 1,
            symbols: 0,
            references: 0
          };
        }
      });

      await watcher.ready;
      watcher.stop();

      expect(refreshes).toBe(1);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('ignores index file and unsupported file events', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-ignore-'));

    try {
      const workspace = await createWorkspace(workspaceRoot);
      const manualWatch = createManualWatchFactory();
      let refreshes = 0;
      const watcher = startIndexWatcher(workspace, {
        debounceMs: 1,
        indexWorkspace: async () => {
          refreshes += 1;
          return {
            ok: true,
            indexPath: path.join(workspace.root, '.syntax-map-mcp', 'index.sqlite'),
            indexedFiles: 0,
            skippedFiles: 0,
            removedFiles: 0,
            schemaVersion: 1,
            symbols: 0,
            references: 0
          };
        },
        watchFactory: manualWatch.watchFactory
      });

      await watcher.ready;
      manualWatch.emit('change', '.syntax-map-mcp/index.sqlite');
      manualWatch.emit('change', 'README.md');
      await watcher.flush();

      expect(refreshes).toBe(1);

      watcher.stop();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('debounces supported file events before refreshing', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-debounce-'));

    try {
      const workspace = await createWorkspace(workspaceRoot);
      const manualWatch = createManualWatchFactory();
      let refreshes = 0;
      const watcher = startIndexWatcher(workspace, {
        debounceMs: 1,
        indexWorkspace: async () => {
          refreshes += 1;
          return {
            ok: true,
            indexPath: path.join(workspace.root, '.syntax-map-mcp', 'index.sqlite'),
            indexedFiles: 0,
            skippedFiles: 0,
            removedFiles: 0,
            schemaVersion: 1,
            symbols: 0,
            references: 0
          };
        },
        watchFactory: manualWatch.watchFactory
      });

      await watcher.ready;
      manualWatch.emit('change', 'first.ts');
      manualWatch.emit('change', 'second.ts');
      await new Promise(resolve => setTimeout(resolve, 10));
      await watcher.flush();

      expect(refreshes).toBe(2);

      watcher.stop();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('reports index refresh failures without rejecting startup', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-error-'));

    try {
      const workspace = await createWorkspace(workspaceRoot);
      const manualWatch = createManualWatchFactory();
      const errors: string[] = [];
      const watcher = startIndexWatcher(workspace, {
        indexWorkspace: async () => ({
          ok: false,
          error: {
            code: 'INDEX_ERROR',
            message: 'refresh failed'
          }
        }),
        onError(error) {
          errors.push(error.message);
        },
        watchFactory: manualWatch.watchFactory
      });

      await watcher.ready;

      expect(errors).toEqual(['refresh failed']);

      watcher.stop();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('swallows index refresh failures when no error handler is registered', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-unhandled-error-'));

    try {
      const workspace = await createWorkspace(workspaceRoot);
      const manualWatch = createManualWatchFactory();
      const watcher = startIndexWatcher(workspace, {
        indexWorkspace: async () => {
          throw 'refresh failed';
        },
        watchFactory: manualWatch.watchFactory
      });

      await expect(watcher.ready).resolves.toBeUndefined();

      watcher.stop();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('normalizes thrown non-error refresh failures for the error handler', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-string-error-'));

    try {
      const workspace = await createWorkspace(workspaceRoot);
      const manualWatch = createManualWatchFactory();
      const errors: string[] = [];
      const watcher = startIndexWatcher(workspace, {
        indexWorkspace: async () => {
          throw 'string failure';
        },
        onError(error) {
          errors.push(error.message);
        },
        watchFactory: manualWatch.watchFactory
      });

      await watcher.ready;

      expect(errors).toEqual(['string failure']);

      watcher.stop();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('skips pending refresh work after the watcher is stopped', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-pending-stop-'));

    try {
      const workspace = await createWorkspace(workspaceRoot);
      const manualWatch = createManualWatchFactory();
      let refreshes = 0;
      const watcher = startIndexWatcher(workspace, {
        indexWorkspace: async () => {
          refreshes += 1;
          return {
            ok: true,
            indexPath: path.join(workspace.root, '.syntax-map-mcp', 'index.sqlite'),
            indexedFiles: 0,
            skippedFiles: 0,
            removedFiles: 0,
            schemaVersion: 1,
            symbols: 0,
            references: 0
          };
        },
        watchFactory: manualWatch.watchFactory
      });

      manualWatch.emit('change', 'queued.ts');
      watcher.stop();
      await watcher.ready;
      await watcher.flush();

      expect(refreshes).toBe(0);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('treats unknown filenames as relevant watch events', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-null-'));

    try {
      const workspace = await createWorkspace(workspaceRoot);
      const manualWatch = createManualWatchFactory();
      let refreshes = 0;
      const watcher = startIndexWatcher(workspace, {
        debounceMs: 1,
        indexWorkspace: async () => {
          refreshes += 1;
          return {
            ok: true,
            indexPath: path.join(workspace.root, '.syntax-map-mcp', 'index.sqlite'),
            indexedFiles: 0,
            skippedFiles: 0,
            removedFiles: 0,
            schemaVersion: 1,
            symbols: 0,
            references: 0
          };
        },
        watchFactory: manualWatch.watchFactory
      });

      await watcher.ready;
      manualWatch.emit('change', null as unknown as string);
      await watcher.flush();

      expect(refreshes).toBe(2);

      watcher.stop();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('stops watching and ignores later events', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-watch-stop-'));

    try {
      const workspace = await createWorkspace(workspaceRoot);
      const manualWatch = createManualWatchFactory();
      let refreshes = 0;
      const watcher = startIndexWatcher(workspace, {
        debounceMs: 1,
        indexWorkspace: async () => {
          refreshes += 1;
          return {
            ok: true,
            indexPath: path.join(workspace.root, '.syntax-map-mcp', 'index.sqlite'),
            indexedFiles: 0,
            skippedFiles: 0,
            removedFiles: 0,
            schemaVersion: 1,
            symbols: 0,
            references: 0
          };
        },
        watchFactory: manualWatch.watchFactory
      });

      await watcher.ready;
      manualWatch.emit('change', 'queued.ts');
      watcher.stop();
      manualWatch.emit('change', 'sample.ts');
      await watcher.flush();

      expect(refreshes).toBe(1);
      expect(manualWatch.closeCount()).toBe(1);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
