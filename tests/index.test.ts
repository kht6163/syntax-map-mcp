import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import {
  clearIndex,
  findIndexedDefinitions,
  findIndexedReferences,
  indexWorkspace,
  searchSymbols
} from '../src/analysis/index.js';
import type { SourceFile, Workspace, WorkspaceFileInfo } from '../src/workspace.js';
import { createWorkspace } from '../src/workspace.js';

describe('workspace index', () => {
  it('removes records for files no longer listed by the workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-remove-'));

    try {
      await writeFile(path.join(root, 'removed.ts'), 'export class RemovedThing {}\n');
      const workspace = await createWorkspace(root);
      await indexWorkspace(workspace);
      await rm(path.join(root, 'removed.ts'));

      const result = await indexWorkspace(workspace);

      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          indexedFiles: 0,
          removedFiles: 1,
          symbols: 0,
          references: 0
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stores file-level errors when listed files cannot be read', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-read-error-'));
    const fileInfo = await fakeFileInfo(root, 'broken.ts');
    const workspace: Workspace = {
      root,
      listSourceFiles: async () => [fileInfo],
      readSourceFile: async () => ({
        ok: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File disappeared'
        }
      }),
      readSourceFiles: async () => []
    };

    try {
      const result = await indexWorkspace(workspace);

      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          indexedFiles: 1,
          symbols: 0,
          references: 0
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stores parse errors for listed files that fail parser detection', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-parse-error-'));
    const fileInfo = await fakeFileInfo(root, 'broken.ts');
    const file: SourceFile = {
      ok: true,
      absolutePath: path.join(root, 'broken.md'),
      relativePath: 'broken.ts',
      text: '# not source',
      size: fileInfo.size,
      mtimeMs: fileInfo.mtimeMs
    };
    const workspace: Workspace = {
      root,
      listSourceFiles: async () => [fileInfo],
      readSourceFile: async () => file,
      readSourceFiles: async () => [file]
    };

    try {
      const result = await indexWorkspace(workspace);

      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          indexedFiles: 1,
          symbols: 0,
          references: 0
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns empty snippets when indexed files are stale and no longer readable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-stale-snippet-'));

    try {
      await writeFile(
        path.join(root, 'stale.ts'),
        ['export class StaleThing {}', 'const staleThing = new StaleThing();'].join('\n')
      );
      const workspace = await createWorkspace(root);
      await indexWorkspace(workspace);
      await rm(path.join(root, 'stale.ts'));

      const symbols = await searchSymbols(workspace, { query: 'StaleThing' });
      const definitions = await findIndexedDefinitions(workspace, { name: 'StaleThing' });
      const references = await findIndexedReferences(workspace, { name: 'StaleThing' });

      expect(symbols).toEqual(
        expect.objectContaining({
          ok: true,
          symbols: expect.arrayContaining([expect.objectContaining({ snippet: '' })])
        })
      );
      expect(definitions).toEqual(
        expect.objectContaining({
          ok: true,
          definitions: expect.arrayContaining([expect.objectContaining({ snippet: '' })])
        })
      );
      expect(references).toEqual(
        expect.objectContaining({
          ok: true,
          references: expect.arrayContaining([expect.objectContaining({ snippet: '' })])
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('filters indexed definitions by kind', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-definition-kind-'));

    try {
      await writeFile(
        path.join(root, 'symbols.ts'),
        ['export class SharedThing {}', 'export function SharedThingFactory() { return new SharedThing(); }'].join('\n')
      );
      const workspace = await createWorkspace(root);
      await indexWorkspace(workspace);

      const result = await findIndexedDefinitions(workspace, {
        name: 'SharedThing',
        kinds: ['function']
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          total: 0,
          definitions: []
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns failures for invalid indexed query options', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-invalid-options-'));

    try {
      const workspace = await createWorkspace(root);

      await expect(findIndexedDefinitions(workspace, { name: 'Thing', limit: 0 })).resolves.toEqual({
        ok: false,
        error: {
          code: 'INDEX_ERROR',
          message: 'limit must be an integer between 1 and 500 (received 0)'
        }
      });
      await expect(findIndexedReferences(workspace, { name: 'Thing', limit: 0 })).resolves.toEqual({
        ok: false,
        error: {
          code: 'INDEX_ERROR',
          message: 'limit must be an integer between 1 and 500 (received 0)'
        }
      });
      await expect(searchSymbols(workspace, { query: 'Thing', limit: 0 })).resolves.toEqual({
        ok: false,
        error: {
          code: 'INDEX_ERROR',
          message: 'limit must be an integer between 1 and 500 (received 0)'
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns undefined selection ranges for indexed variable symbols', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-variable-selection-'));

    try {
      await writeFile(path.join(root, 'variable.ts'), 'const localValue = 1;\n');
      await writeIndexWithNullSelection(root, 'variable.ts');
      const workspace = await createWorkspace(root);

      const result = await searchSymbols(workspace, { query: 'localValue' });

      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          symbols: [
            expect.objectContaining({
              name: 'localValue',
              selectionRange: undefined
            })
          ]
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns index failures when clearing an index directory path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'syntax-map-index-clear-error-'));

    try {
      await mkdir(path.join(root, '.syntax-map-mcp'), { recursive: true });
      await mkdir(path.join(root, '.syntax-map-mcp', 'index.sqlite'));
      const workspace = await createWorkspace(root);

      const result = await clearIndex(workspace);

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'INDEX_ERROR',
          message: expect.any(String)
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function fakeFileInfo(root: string, relativePath: string): Promise<WorkspaceFileInfo> {
  await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await writeFile(path.join(root, relativePath), 'export const value = 1;\n');
  const fileStat = await stat(path.join(root, relativePath));

  return {
    absolutePath: path.join(root, relativePath),
    relativePath,
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs
  };
}

async function writeIndexWithNullSelection(root: string, relativePath: string): Promise<void> {
  const fileInfo = await fakeFileInfo(root, relativePath);
  const SQL = await initSqlJs();
  const database = new SQL.Database();

  database.exec(`
    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE files (
      path TEXT PRIMARY KEY,
      language TEXT,
      size INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      parse_status TEXT NOT NULL,
      error_message TEXT,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      language TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      parent_name TEXT,
      start_row INTEGER NOT NULL,
      start_column INTEGER NOT NULL,
      end_row INTEGER NOT NULL,
      end_column INTEGER NOT NULL,
      selection_start_row INTEGER,
      selection_start_column INTEGER,
      selection_end_row INTEGER,
      selection_end_column INTEGER
    );

    CREATE TABLE reference_captures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      language TEXT NOT NULL,
      name TEXT NOT NULL,
      node_type TEXT NOT NULL,
      start_row INTEGER NOT NULL,
      start_column INTEGER NOT NULL,
      end_row INTEGER NOT NULL,
      end_column INTEGER NOT NULL
    );
  `);

  database.run('INSERT INTO metadata (key, value) VALUES (?, ?)', ['schema_version', '1']);
  database.run(
    `
      INSERT INTO files (path, language, size, mtime_ms, parse_status, error_message, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [relativePath, 'typescript', fileInfo.size, fileInfo.mtimeMs, 'ok', null, new Date().toISOString()]
  );
  database.run(
    `
      INSERT INTO symbols (
        file_path,
        language,
        name,
        kind,
        parent_name,
        start_row,
        start_column,
        end_row,
        end_column,
        selection_start_row,
        selection_start_column,
        selection_end_row,
        selection_end_column
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [relativePath, 'typescript', 'localValue', 'variable', null, 0, 6, 0, 16, null, null, null, null]
  );

  const indexPath = path.join(root, '.syntax-map-mcp', 'index.sqlite');
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, Buffer.from(database.export()));
  database.close();
}
