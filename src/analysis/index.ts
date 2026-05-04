import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';
import type { Database, SqlValue } from 'sql.js';
import { listSymbols } from './symbols.js';
import { parseSourceFile } from '../parser.js';
import type { CodeSymbol, SupportedLanguage, ToolFailure } from '../types.js';
import type { Workspace, WorkspaceFileInfo } from '../workspace.js';

type IndexResult =
  | {
      ok: true;
      indexPath: string;
      indexedFiles: number;
      skippedFiles: number;
      removedFiles: number;
      symbols: number;
    }
  | ToolFailure;

type SearchSymbolsResult =
  | {
      ok: true;
      indexPath: string;
      isStale: boolean;
      staleFiles: number;
      refreshed: boolean;
      total: number;
      symbols: Array<
        CodeSymbol & {
          path: string;
          language: SupportedLanguage;
        }
      >;
    }
  | ToolFailure;

type IndexedDefinitionResult =
  | {
      ok: true;
      indexPath: string;
      isStale: boolean;
      staleFiles: number;
      refreshed: boolean;
      total: number;
      definitions: Array<
        CodeSymbol & {
          path: string;
          language: SupportedLanguage;
          snippet: string;
        }
      >;
    }
  | ToolFailure;

type IndexStatusResult =
  | {
      ok: true;
      indexPath: string;
      indexedFiles: number;
      symbols: number;
      staleFiles: number;
    }
  | ToolFailure;

type ClearIndexResult =
  | {
      ok: true;
      indexPath: string;
      cleared: true;
    }
  | ToolFailure;

type StoredFile = {
  path: string;
  size: number;
  mtimeMs: number;
  parseStatus: string;
};

type IndexReadState = {
  database: Database;
  indexPath: string;
  isStale: boolean;
  staleFiles: number;
  refreshed: boolean;
};

const INDEX_DIRECTORY = '.syntax-map-mcp';
const INDEX_FILE = 'index.sqlite';

function indexPathForWorkspace(workspace: Workspace): string {
  return path.join(workspace.root, INDEX_DIRECTORY, INDEX_FILE);
}

function failure(message: string): ToolFailure {
  return {
    ok: false,
    error: {
      code: 'INDEX_ERROR',
      message
    }
  };
}

async function openDatabase(indexPath: string): Promise<Database> {
  const SQL = await initSqlJs();

  try {
    const data = await readFile(indexPath);
    return new SQL.Database(data);
  } catch {
    return new SQL.Database();
  }
}

async function saveDatabase(database: Database, indexPath: string): Promise<void> {
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, Buffer.from(database.export()));
}

function initSchema(database: Database): void {
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      language TEXT,
      size INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      parse_status TEXT NOT NULL,
      error_message TEXT,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS symbols (
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
      selection_end_column INTEGER,
      FOREIGN KEY(file_path) REFERENCES files(path) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS symbols_name_idx ON symbols(name);
    CREATE INDEX IF NOT EXISTS symbols_kind_idx ON symbols(kind);
  `);
}

function selectStoredFiles(database: Database): Map<string, StoredFile> {
  const rows = database.exec('SELECT path, size, mtime_ms, parse_status FROM files');
  const files = new Map<string, StoredFile>();
  const result = rows[0];
  if (!result) return files;

  for (const row of result.values) {
    const [filePath, size, mtimeMs, parseStatus] = row;
    files.set(String(filePath), {
      path: String(filePath),
      size: Number(size),
      mtimeMs: Number(mtimeMs),
      parseStatus: String(parseStatus)
    });
  }

  return files;
}

function isCurrent(stored: StoredFile | undefined, current: WorkspaceFileInfo): boolean {
  return (
    stored !== undefined &&
    stored.parseStatus === 'ok' &&
    stored.size === current.size &&
    stored.mtimeMs === current.mtimeMs
  );
}

async function countStaleFiles(workspace: Workspace, database: Database): Promise<number> {
  const storedFiles = selectStoredFiles(database);
  const currentFiles = await workspace.listSourceFiles();
  const currentPaths = new Set(currentFiles.map(file => file.relativePath));
  let staleFiles = 0;

  for (const file of currentFiles) {
    if (!isCurrent(storedFiles.get(file.relativePath), file)) {
      staleFiles += 1;
    }
  }

  for (const storedPath of storedFiles.keys()) {
    if (!currentPaths.has(storedPath)) {
      staleFiles += 1;
    }
  }

  return staleFiles;
}

async function openIndexForRead(
  workspace: Workspace,
  input: { refreshIfStale?: boolean }
): Promise<IndexReadState> {
  const indexPath = indexPathForWorkspace(workspace);
  let database = await openDatabase(indexPath);
  initSchema(database);

  const initialStaleFiles = await countStaleFiles(workspace, database);
  if (!input.refreshIfStale || initialStaleFiles === 0) {
    return {
      database,
      indexPath,
      isStale: initialStaleFiles > 0,
      staleFiles: initialStaleFiles,
      refreshed: false
    };
  }

  database.close();

  const refreshedIndex = await indexWorkspace(workspace);
  if (!refreshedIndex.ok) {
    throw new Error(refreshedIndex.error.message);
  }

  database = await openDatabase(indexPath);
  initSchema(database);

  const staleFiles = await countStaleFiles(workspace, database);
  return {
    database,
    indexPath,
    isStale: staleFiles > 0,
    staleFiles,
    refreshed: true
  };
}

function upsertFile(
  database: Database,
  input: {
    file: WorkspaceFileInfo;
    language: SupportedLanguage | null;
    parseStatus: 'ok' | 'error';
    errorMessage: string | null;
  }
): void {
  database.run(
    `
      INSERT INTO files (path, language, size, mtime_ms, parse_status, error_message, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        language = excluded.language,
        size = excluded.size,
        mtime_ms = excluded.mtime_ms,
        parse_status = excluded.parse_status,
        error_message = excluded.error_message,
        indexed_at = excluded.indexed_at
    `,
    [
      input.file.relativePath,
      input.language,
      input.file.size,
      input.file.mtimeMs,
      input.parseStatus,
      input.errorMessage,
      new Date().toISOString()
    ]
  );
}

function insertSymbol(
  database: Database,
  input: {
    filePath: string;
    language: SupportedLanguage;
    symbol: CodeSymbol;
  }
): void {
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
    [
      input.filePath,
      input.language,
      input.symbol.name,
      input.symbol.kind,
      input.symbol.parentName ?? null,
      input.symbol.range.start.row,
      input.symbol.range.start.column,
      input.symbol.range.end.row,
      input.symbol.range.end.column,
      input.symbol.selectionRange?.start.row ?? null,
      input.symbol.selectionRange?.start.column ?? null,
      input.symbol.selectionRange?.end.row ?? null,
      input.symbol.selectionRange?.end.column ?? null
    ]
  );
}

function deleteFile(database: Database, filePath: string): void {
  database.run('DELETE FROM files WHERE path = ?', [filePath]);
}

function deleteSymbolsForFile(database: Database, filePath: string): void {
  database.run('DELETE FROM symbols WHERE file_path = ?', [filePath]);
}

function scalarCount(database: Database, sql: string): number {
  const result = database.exec(sql)[0];
  if (!result) return 0;
  return Number(result.values[0]?.[0] ?? 0);
}

function sqlLikePattern(query: string): string {
  return `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function rowValue(row: Record<string, SqlValue>, key: string): SqlValue {
  return row[key];
}

function lineAt(text: string, row: number): string {
  return text.split(/\r?\n/)[row] ?? '';
}

export async function indexWorkspace(workspace: Workspace): Promise<IndexResult> {
  const indexPath = indexPathForWorkspace(workspace);
  const database = await openDatabase(indexPath);

  try {
    initSchema(database);

    const currentFiles = await workspace.listSourceFiles();
    const currentPaths = new Set(currentFiles.map(file => file.relativePath));
    const storedFiles = selectStoredFiles(database);
    let removedFiles = 0;
    let indexedFiles = 0;
    let skippedFiles = 0;

    for (const storedPath of storedFiles.keys()) {
      if (!currentPaths.has(storedPath)) {
        deleteFile(database, storedPath);
        removedFiles += 1;
      }
    }

    for (const fileInfo of currentFiles) {
      if (isCurrent(storedFiles.get(fileInfo.relativePath), fileInfo)) {
        skippedFiles += 1;
        continue;
      }

      const file = await workspace.readSourceFile(fileInfo.relativePath);
      if (!file.ok) {
        upsertFile(database, {
          file: fileInfo,
          language: null,
          parseStatus: 'error',
          errorMessage: file.error.message
        });
        deleteSymbolsForFile(database, fileInfo.relativePath);
        indexedFiles += 1;
        continue;
      }

      const parsed = parseSourceFile(file);
      if (!parsed.ok) {
        upsertFile(database, {
          file: fileInfo,
          language: null,
          parseStatus: 'error',
          errorMessage: parsed.error.message
        });
        deleteSymbolsForFile(database, fileInfo.relativePath);
        indexedFiles += 1;
        continue;
      }

      upsertFile(database, {
        file: fileInfo,
        language: parsed.language,
        parseStatus: 'ok',
        errorMessage: null
      });
      deleteSymbolsForFile(database, fileInfo.relativePath);

      for (const symbol of listSymbols(parsed)) {
        insertSymbol(database, {
          filePath: fileInfo.relativePath,
          language: parsed.language,
          symbol
        });
      }

      indexedFiles += 1;
    }

    await saveDatabase(database, indexPath);

    return {
      ok: true,
      indexPath,
      indexedFiles,
      skippedFiles,
      removedFiles,
      symbols: scalarCount(database, 'SELECT COUNT(*) FROM symbols')
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  } finally {
    database.close();
  }
}

export async function findIndexedDefinitions(
  workspace: Workspace,
  input: {
    name: string;
    kinds?: CodeSymbol['kind'][];
    limit?: number;
    refreshIfStale?: boolean;
  }
): Promise<IndexedDefinitionResult> {
  let readState: IndexReadState | undefined;

  try {
    readState = await openIndexForRead(workspace, input);
    const { database } = readState;

    const where = ['name = ?'];
    const params: SqlValue[] = [input.name];

    if (input.kinds && input.kinds.length > 0) {
      where.push(`kind IN (${input.kinds.map(() => '?').join(', ')})`);
      params.push(...input.kinds);
    }

    const limit = input.limit ?? 50;
    params.push(limit);

    const statement = database.prepare(
      `
        SELECT
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
        FROM symbols
        WHERE ${where.join(' AND ')}
        ORDER BY file_path ASC, start_row ASC, name ASC
        LIMIT ?
      `,
      params
    );
    const definitions: Array<
      CodeSymbol & { path: string; language: SupportedLanguage; snippet: string }
    > = [];

    try {
      while (statement.step()) {
        const row = statement.getAsObject();
        const selectionStartRow = rowValue(row, 'selection_start_row');
        const selectionStartColumn = rowValue(row, 'selection_start_column');
        const selectionEndRow = rowValue(row, 'selection_end_row');
        const selectionEndColumn = rowValue(row, 'selection_end_column');
        const filePath = String(rowValue(row, 'file_path'));
        const startRow = Number(rowValue(row, 'start_row'));
        const file = await workspace.readSourceFile(filePath);

        definitions.push({
          path: filePath,
          language: rowValue(row, 'language') as SupportedLanguage,
          name: String(rowValue(row, 'name')),
          kind: rowValue(row, 'kind') as CodeSymbol['kind'],
          parentName:
            rowValue(row, 'parent_name') === null ? undefined : String(rowValue(row, 'parent_name')),
          range: {
            start: {
              row: startRow,
              column: Number(rowValue(row, 'start_column'))
            },
            end: {
              row: Number(rowValue(row, 'end_row')),
              column: Number(rowValue(row, 'end_column'))
            }
          },
          selectionRange:
            selectionStartRow === null ||
            selectionStartColumn === null ||
            selectionEndRow === null ||
            selectionEndColumn === null
              ? undefined
              : {
                  start: {
                    row: Number(selectionStartRow),
                    column: Number(selectionStartColumn)
                  },
                  end: {
                    row: Number(selectionEndRow),
                    column: Number(selectionEndColumn)
                  }
                },
          snippet: file.ok ? lineAt(file.text, startRow) : ''
        });
      }
    } finally {
      statement.free();
    }

    return {
      ok: true,
      indexPath: readState.indexPath,
      isStale: readState.isStale,
      staleFiles: readState.staleFiles,
      refreshed: readState.refreshed,
      total: definitions.length,
      definitions
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  } finally {
    readState?.database.close();
  }
}

export async function searchSymbols(
  workspace: Workspace,
  input: {
    query: string;
    kinds?: CodeSymbol['kind'][];
    limit?: number;
    refreshIfStale?: boolean;
  }
): Promise<SearchSymbolsResult> {
  let readState: IndexReadState | undefined;

  try {
    readState = await openIndexForRead(workspace, input);
    const { database } = readState;

    const where = ['name LIKE ? ESCAPE "\\"'];
    const params: SqlValue[] = [sqlLikePattern(input.query)];

    if (input.kinds && input.kinds.length > 0) {
      where.push(`kind IN (${input.kinds.map(() => '?').join(', ')})`);
      params.push(...input.kinds);
    }

    const limit = input.limit ?? 50;
    params.push(limit);

    const statement = database.prepare(
      `
        SELECT
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
        FROM symbols
        WHERE ${where.join(' AND ')}
        ORDER BY name ASC, file_path ASC, start_row ASC
        LIMIT ?
      `,
      params
    );
    const symbols: Array<CodeSymbol & { path: string; language: SupportedLanguage }> = [];

    try {
      while (statement.step()) {
        const row = statement.getAsObject();
        const selectionStartRow = rowValue(row, 'selection_start_row');
        const selectionStartColumn = rowValue(row, 'selection_start_column');
        const selectionEndRow = rowValue(row, 'selection_end_row');
        const selectionEndColumn = rowValue(row, 'selection_end_column');

        symbols.push({
          path: String(rowValue(row, 'file_path')),
          language: rowValue(row, 'language') as SupportedLanguage,
          name: String(rowValue(row, 'name')),
          kind: rowValue(row, 'kind') as CodeSymbol['kind'],
          parentName:
            rowValue(row, 'parent_name') === null ? undefined : String(rowValue(row, 'parent_name')),
          range: {
            start: {
              row: Number(rowValue(row, 'start_row')),
              column: Number(rowValue(row, 'start_column'))
            },
            end: {
              row: Number(rowValue(row, 'end_row')),
              column: Number(rowValue(row, 'end_column'))
            }
          },
          selectionRange:
            selectionStartRow === null ||
            selectionStartColumn === null ||
            selectionEndRow === null ||
            selectionEndColumn === null
              ? undefined
              : {
                  start: {
                    row: Number(selectionStartRow),
                    column: Number(selectionStartColumn)
                  },
                  end: {
                    row: Number(selectionEndRow),
                    column: Number(selectionEndColumn)
                  }
                }
        });
      }
    } finally {
      statement.free();
    }

    return {
      ok: true,
      indexPath: readState.indexPath,
      isStale: readState.isStale,
      staleFiles: readState.staleFiles,
      refreshed: readState.refreshed,
      total: symbols.length,
      symbols
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  } finally {
    readState?.database.close();
  }
}

export async function getIndexStatus(workspace: Workspace): Promise<IndexStatusResult> {
  const indexPath = indexPathForWorkspace(workspace);
  const database = await openDatabase(indexPath);

  try {
    initSchema(database);

    const staleFiles = await countStaleFiles(workspace, database);

    return {
      ok: true,
      indexPath,
      indexedFiles: scalarCount(database, 'SELECT COUNT(*) FROM files WHERE parse_status = "ok"'),
      symbols: scalarCount(database, 'SELECT COUNT(*) FROM symbols'),
      staleFiles
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  } finally {
    database.close();
  }
}

export async function clearIndex(workspace: Workspace): Promise<ClearIndexResult> {
  const indexPath = indexPathForWorkspace(workspace);

  try {
    await rm(indexPath, { force: true });
    return {
      ok: true,
      indexPath,
      cleared: true
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}
