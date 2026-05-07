import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { indexWorkspace } from './index.js';
import type { Workspace } from '../workspace.js';

type IndexWorkspace = typeof indexWorkspace;

export type WatchFactory = (
  root: string,
  options: { recursive: boolean },
  listener: (eventType: string, filename: string | Buffer | null) => void
) => FSWatcher;

type Timer = ReturnType<typeof setTimeout>;

export type IndexWatcher = {
  ready: Promise<void>;
  flush(): Promise<void>;
  stop(): void;
};

export type IndexWatcherOptions = {
  debounceMs?: number;
  indexWorkspace?: IndexWorkspace;
  watchFactory?: WatchFactory;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  onError?: (error: Error) => void;
};

const DEFAULT_DEBOUNCE_MS = 250;
const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.rs']);
const EXCLUDED_DIRECTORIES = new Set(['.git', '.syntax-map-mcp', 'dist', 'node_modules']);

/* v8 ignore next -- default fs.watch wiring is exercised by CLI/manual MCP runs. */
const defaultWatchFactory: WatchFactory = (root, options, listener) => watch(root, options, listener);

export function startIndexWatcher(workspace: Workspace, options: IndexWatcherOptions = {}): IndexWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const refreshIndex = options.indexWorkspace ?? indexWorkspace;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let stopped = false;
  let timer: Timer | undefined;
  let refreshChain = Promise.resolve();

  function runRefresh(): Promise<void> {
    refreshChain = refreshChain
      .then(async () => {
        if (stopped) return;

        const result = await refreshIndex(workspace);
        if (!result.ok) {
          throw new Error(result.error.message);
        }
      })
      .catch(error => {
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      });

    return refreshChain;
  }

  function scheduleRefresh(filename: string | Buffer | null): void {
    if (stopped || !isRelevantWatchPath(filename)) return;

    if (timer) {
      clearTimer(timer);
    }

    timer = setTimer(() => {
      timer = undefined;
      void runRefresh();
    }, debounceMs);
    timer.unref?.();
  }

  /* v8 ignore next -- tests inject watchFactory to avoid platform-specific fs.watch behavior. */
  const watchFactory =
    options.watchFactory ??
    /* v8 ignore next -- default fs.watch wiring is exercised by CLI/manual MCP runs. */
    defaultWatchFactory;
  const watcher = watchFactory(workspace.root, { recursive: true }, (_eventType, filename) => {
    scheduleRefresh(filename);
  });
  watcher.unref?.();

  return {
    ready: runRefresh(),
    async flush() {
      if (timer) {
        clearTimer(timer);
        timer = undefined;
        await runRefresh();
      }

      await refreshChain;
    },
    stop() {
      stopped = true;
      if (timer) {
        clearTimer(timer);
        timer = undefined;
      }
      watcher.close();
    }
  };
}

function isRelevantWatchPath(filename: string | Buffer | null): boolean {
  if (filename === null) return true;

  const normalized = filename.toString().split(path.sep).join('/');
  const parts = normalized.split('/');

  if (parts.some(part => EXCLUDED_DIRECTORIES.has(part))) return false;

  return SUPPORTED_EXTENSIONS.has(path.extname(normalized));
}
