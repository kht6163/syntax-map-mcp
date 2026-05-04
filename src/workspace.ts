import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ToolErrorCode } from './types.js';

export type SourceFile = {
  ok: true;
  absolutePath: string;
  relativePath: string;
  text: string;
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
};

const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py']);

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

    const fileStat = await stat(actualPath);
    if (!fileStat.isFile()) {
      return failure('FILE_NOT_FOUND', `Not a file: ${inputPath}`);
    }

    return {
      ok: true,
      absolutePath: actualPath,
      relativePath: path.relative(root, actualPath),
      text: await readFile(actualPath, 'utf8')
    };
  }

  return {
    root,
    readSourceFile,
    readSourceFiles(inputPaths: string[]) {
      return Promise.all(inputPaths.map(readSourceFile));
    }
  };
}
