#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { runServer } from './server.js';
import type { ServerOptions } from './server.js';

type RunServer = (options: ServerOptions) => Promise<void>;

export function readWorkspaceRoot(argv: string[], env: NodeJS.ProcessEnv, cwd = process.cwd()): string {
  const flagIndex = argv.indexOf('--workspace-root');
  if (flagIndex >= 0 && argv[flagIndex + 1]) {
    return argv[flagIndex + 1];
  }
  return env.WORKSPACE_ROOT ?? cwd;
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  runner: RunServer = runServer
): Promise<void> {
  await runner({
    workspaceRoot: readWorkspaceRoot(argv, env, cwd)
  });
}

export function isDirectCliRun(
  moduleUrl: string,
  argvPath = process.argv[1],
  resolvePath: (value: string) => string = realpathSync
): boolean {
  if (!argvPath) return false;

  try {
    return moduleUrl === pathToFileURL(resolvePath(argvPath)).href;
  } catch {
    return moduleUrl === pathToFileURL(argvPath).href;
  }
}

/* v8 ignore next 3 -- direct CLI execution is covered by package smoke tests. */
if (isDirectCliRun(import.meta.url)) {
  await main();
}
