import { describe, expect, it } from 'vitest';
import { createInitializeRequest, readInitializeServerInfo } from '../scripts/smoke-package-install.mjs';

describe('package install smoke helpers', () => {
  it('creates an MCP initialize request', () => {
    expect(JSON.parse(createInitializeRequest(7))).toEqual({
      jsonrpc: '2.0',
      id: 7,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'syntax-map-mcp-smoke-test',
          version: '1.0.0'
        }
      }
    });
  });

  it('reads server info from initialize response lines', () => {
    expect(
      readInitializeServerInfo([
        '{"jsonrpc":"2.0","method":"notifications/message","params":{"level":"info","data":"skip"}}',
        '{"jsonrpc":"2.0","id":7,"result":{"serverInfo":{"name":"syntax-map-mcp","version":"0.1.7"}}}'
      ])
    ).toEqual({
      name: 'syntax-map-mcp',
      version: '0.1.7'
    });
  });
});
