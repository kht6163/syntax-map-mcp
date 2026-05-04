import { describe, expect, it } from 'vitest';
import { jsonResult, toolFailure } from '../src/result.js';

describe('result helpers', () => {
  it('returns text content and structuredContent together', () => {
    const result = jsonResult({ ok: true, value: 1 });

    expect(result.structuredContent).toEqual({ ok: true, value: 1 });
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ ok: true, value: 1 }, null, 2) }
    ]);
  });

  it('returns tool-level failures as isError responses', () => {
    const result = toolFailure('WORKSPACE_OUTSIDE_ROOT', 'outside root');

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: { code: 'WORKSPACE_OUTSIDE_ROOT', message: 'outside root' }
    });
  });
});
