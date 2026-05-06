import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServerInfo } from '../src/server.js';

describe('server metadata', () => {
  it('uses the package version for MCP server info', async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };

    await expect(createServerInfo()).resolves.toEqual({
      name: 'syntax-map-mcp',
      version: packageJson.version
    });
  });
});
