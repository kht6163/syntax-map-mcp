import { describe, expect, it } from 'vitest';
import { isDirectCliRun, main, readWorkspaceRoot } from '../src/cli.js';

describe('cli', () => {
  it('prefers --workspace-root over environment and cwd defaults', () => {
    expect(readWorkspaceRoot(['--workspace-root', '/repo'], { WORKSPACE_ROOT: '/env' }, '/cwd')).toBe('/repo');
  });

  it('uses WORKSPACE_ROOT when the flag is not provided', () => {
    expect(readWorkspaceRoot([], { WORKSPACE_ROOT: '/env' }, '/cwd')).toBe('/env');
  });

  it('falls back to cwd when no workspace root is configured', () => {
    expect(readWorkspaceRoot([], {}, '/cwd')).toBe('/cwd');
  });

  it('runs the MCP server with the resolved workspace root', async () => {
    const calls: Array<{ workspaceRoot: string }> = [];

    await main(['--workspace-root', '/repo'], {}, '/cwd', async options => {
      calls.push(options);
    });

    expect(calls).toEqual([{ workspaceRoot: '/repo' }]);
  });

  it('detects direct execution through npm bin symlinks', () => {
    expect(
      isDirectCliRun('file:///repo/node_modules/syntax-map-mcp/dist/cli.js', '/repo/node_modules/.bin/syntax-map-mcp', () =>
        '/repo/node_modules/syntax-map-mcp/dist/cli.js'
      )
    ).toBe(true);
  });

  it('ignores imports without an argv entry point', () => {
    expect(isDirectCliRun('file:///repo/dist/cli.js', '')).toBe(false);
  });

  it('uses the process argv entry point by default', () => {
    expect(isDirectCliRun('file:///not-the-vitest-entry.js')).toBe(false);
  });

  it('falls back to the argv path when realpath resolution fails', () => {
    expect(
      isDirectCliRun('file:///repo/dist/cli.js', '/repo/dist/cli.js', () => {
        throw new Error('missing');
      })
    ).toBe(true);
  });
});
