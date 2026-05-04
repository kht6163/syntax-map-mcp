#!/usr/bin/env node
import process from 'node:process';
import { runServer } from './server.js';

function readWorkspaceRoot(argv: string[], env: NodeJS.ProcessEnv): string {
  const flagIndex = argv.indexOf('--workspace-root');
  if (flagIndex >= 0 && argv[flagIndex + 1]) {
    return argv[flagIndex + 1];
  }
  return env.WORKSPACE_ROOT ?? process.cwd();
}

await runServer({
  workspaceRoot: readWorkspaceRoot(process.argv.slice(2), process.env)
});
