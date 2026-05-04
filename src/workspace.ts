import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ToolErrorCode } from './types.js';

export type SourceFile = {
  ok: true;
  absolutePath: string;
  relativePath: string;
  text: string;
  size: number;
  mtimeMs: number;
};

export type WorkspaceFileInfo = {
  absolutePath: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
};

export type WorkspaceFailure = {
  ok: false;
  error: {
    code: ToolErrorCode;
    message: string;
  };
};

export type Workspace = {
  root: string;
  readSourceFile(inputPath: string): Promise<SourceFile | WorkspaceFailure>;
  readSourceFiles(inputPaths: string[]): Promise<Array<SourceFile | WorkspaceFailure>>;
  listSourceFiles(): Promise<WorkspaceFileInfo[]>;
};

const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py']);
const EXCLUDED_DIRECTORIES = new Set(['.git', '.syntax-map-mcp', 'dist', 'node_modules']);

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function failure(code: ToolErrorCode, message: string): WorkspaceFailure {
  return { ok: false, error: { code, message } };
}

export async function createWorkspace(workspaceRoot: string): Promise<Workspace> {
  const root = await realpath(path.resolve(workspaceRoot));

  async function readSourceFile(inputPath: string): Promise<SourceFile | WorkspaceFailure> {
    const resolved = path.resolve(root, inputPath);

    if (!isInsideRoot(root, resolved)) {
      return failure('WORKSPACE_OUTSIDE_ROOT', `Path is outside workspaceRoot: ${inputPath}`);
    }

    const extension = path.extname(resolved);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return failure('UNSUPPORTED_EXTENSION', `Unsupported extension: ${extension}`);
    }

    let actualPath: string;
    try {
      actualPath = await realpath(resolved);
    } catch {
      return failure('FILE_NOT_FOUND', `File not found: ${inputPath}`);
    }

    if (!isInsideRoot(root, actualPath)) {
      return failure('WORKSPACE_OUTSIDE_ROOT', `Path is outside workspaceRoot: ${inputPath}`);
    }

    const actualExtension = path.extname(actualPath);
    if (!SUPPORTED_EXTENSIONS.has(actualExtension)) {
      return failure('UNSUPPORTED_EXTENSION', `Unsupported extension: ${actualExtension}`);
    }

    const fileStat = await stat(actualPath);
    if (!fileStat.isFile()) {
      return failure('FILE_NOT_FOUND', `Not a file: ${inputPath}`);
    }

    return {
      ok: true,
      absolutePath: actualPath,
      relativePath: path.relative(root, actualPath),
      text: await readFile(actualPath, 'utf8'),
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs
    };
  }

  async function listSourceFilesInDirectory(directory: string): Promise<WorkspaceFileInfo[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: WorkspaceFileInfo[] = [];

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
          files.push(...(await listSourceFilesInDirectory(absolutePath)));
        }
        continue;
      }

      if (!entry.isFile() || !SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }

      let actualPath: string;
      try {
        actualPath = await realpath(absolutePath);
      } catch {
        continue;
      }

      if (!isInsideRoot(root, actualPath)) {
        continue;
      }

      const fileStat = await stat(actualPath);
      if (!fileStat.isFile()) {
        continue;
      }

      files.push({
        absolutePath: actualPath,
        relativePath: path.relative(root, actualPath),
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs
      });
    }

    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  return {
    root,
    readSourceFile,
    readSourceFiles(inputPaths: string[]) {
      return Promise.all(inputPaths.map(readSourceFile));
    },
    listSourceFiles() {
      return listSourceFilesInDirectory(root);
    }
  };
}
