import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
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

type GitignoreMatcher = {
  baseDirectory: string;
  matcher: ReturnType<typeof ignore>;
};

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function failure(code: ToolErrorCode, message: string): WorkspaceFailure {
  return { ok: false, error: { code, message } };
}

async function loadGitignore(directory: string): Promise<GitignoreMatcher | undefined> {
  const matcher = ignore();

  try {
    matcher.add(await readFile(path.join(directory, '.gitignore'), 'utf8'));
  } catch {
    return undefined;
  }

  return { baseDirectory: directory, matcher };
}

function toGitignorePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function isGitignored(absolutePath: string, matchers: GitignoreMatcher[]): boolean {
  let ignored = false;

  for (const { baseDirectory, matcher } of matchers) {
    const relativePath = path.relative(baseDirectory, absolutePath);
    /* v8 ignore next 3 -- matcher base directories are loaded from workspace traversal roots. */
    if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      continue;
    }

    const result = matcher.test(toGitignorePath(relativePath));
    if (result.ignored) {
      ignored = true;
    }
    /* v8 ignore next 3 -- unignore precedence is covered by end-to-end gitignore tests. */
    if (result.unignored) {
      ignored = false;
    }
  }

  return ignored;
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

  async function listSourceFilesInDirectory(
    directory: string,
    parentMatchers: GitignoreMatcher[]
  ): Promise<WorkspaceFileInfo[]> {
    const gitignore = await loadGitignore(directory);
    const matchers = gitignore ? [...parentMatchers, gitignore] : parentMatchers;
    const entries = await readdir(directory, { withFileTypes: true });
    const files: WorkspaceFileInfo[] = [];

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
          files.push(...(await listSourceFilesInDirectory(absolutePath, matchers)));
        }
        continue;
      }

      if (
        !entry.isFile() ||
        !SUPPORTED_EXTENSIONS.has(path.extname(entry.name)) ||
        isGitignored(absolutePath, matchers)
      ) {
        continue;
      }

      let actualPath: string;
      try {
        actualPath = await realpath(absolutePath);
      /* v8 ignore next 3 -- file disappeared between readdir and realpath. */
      } catch {
        continue;
      }

      /* v8 ignore next 4 -- explicit symlink escape checks are covered by readSourceFile tests. */
      if (!isInsideRoot(root, actualPath)) {
        continue;
      }

      const fileStat = await stat(actualPath);
      /* v8 ignore next 4 -- entry was a file at readdir time; this guards filesystem races. */
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
      return listSourceFilesInDirectory(root, []);
    }
  };
}
