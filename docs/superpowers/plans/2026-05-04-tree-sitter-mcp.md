# Tree-sitter MCP 서버 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TypeScript 기반 MCP 서버를 만들고 Tree-sitter로 JavaScript, TypeScript, Python 코드를 파일 단위로 분석하는 6개 tool을 제공한다.

**Architecture:** stdio MCP 서버는 tool 등록과 응답 포맷만 담당한다. 파일 접근, 언어 판별, 파싱, 분석 로직은 작은 모듈로 분리하고 모든 분석은 요청 시점에 온디맨드로 수행한다. `workspaceRoot` 내부 파일만 읽도록 경로 검증을 먼저 통과시킨다.

**Tech Stack:** Node.js, TypeScript, `@modelcontextprotocol/server`, `zod`, `tree-sitter`, `tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-python`, Vitest, tsx

---

## 파일 구조

- `package.json`: npm scripts와 런타임/개발 의존성 정의
- `tsconfig.json`: ESM TypeScript 컴파일 설정
- `vitest.config.ts`: Vitest 설정
- `src/server.ts`: MCP 서버 생성, tool 등록, stdio transport 연결
- `src/cli.ts`: CLI 인자와 환경 변수에서 `workspaceRoot` 확정 후 서버 실행
- `src/types.ts`: 공통 타입과 실패 결과 타입
- `src/result.ts`: MCP tool 응답 헬퍼
- `src/workspace.ts`: 경로 검증, 파일 읽기, 다중 파일 해석
- `src/languages.ts`: 확장자 기반 언어 판별과 Tree-sitter language 로딩
- `src/parser.ts`: 파일 파싱과 Tree-sitter query 실행
- `src/analysis/symbols.ts`: 언어별 심볼 query와 심볼 추출
- `src/analysis/definitions.ts`: 정의 후보 검색
- `src/analysis/references.ts`: 식별자 참조 후보 검색
- `src/analysis/summary.ts`: 파일 구조 요약
- `src/analysis/context.ts`: LLM용 Markdown 컨텍스트 생성
- `src/tools.ts`: 6개 MCP tool 스키마와 handler 연결
- `tests/fixtures/sample.ts`: TypeScript fixture
- `tests/fixtures/sample.js`: JavaScript fixture
- `tests/fixtures/sample.py`: Python fixture
- `tests/*.test.ts`: 모듈별 테스트
- `README.md`: 설치, 실행, MCP 클라이언트 설정 예시

## Task 1: TypeScript 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/cli.ts`
- Create: `src/server.ts`

- [ ] **Step 1: 프로젝트 설정 파일을 작성한다**

Create `package.json`:

```json
{
  "name": "tree-sitter-code-analysis-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "tree-sitter-code-analysis-mcp": "./dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^1.0.0",
    "tree-sitter": "^0.25.0",
    "tree-sitter-javascript": "^0.25.0",
    "tree-sitter-python": "^0.23.0",
    "tree-sitter-typescript": "^0.23.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
```

- [ ] **Step 2: 최소 서버 엔트리를 작성한다**

Create `src/server.ts`:

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

export type ServerOptions = {
  workspaceRoot: string;
};

export function createServer(_options: ServerOptions): McpServer {
  return new McpServer(
    { name: 'tree-sitter-code-analysis', version: '0.1.0' },
    {
      instructions:
        'Analyze JavaScript, TypeScript, and Python source files under the configured workspaceRoot only.'
    }
  );
}

export async function runServer(options: ServerOptions): Promise<void> {
  const server = createServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

Create `src/cli.ts`:

```ts
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
```

- [ ] **Step 3: 의존성을 설치한다**

Run: `npm install`

Expected: `package-lock.json`이 생성되고 설치가 성공한다.

- [ ] **Step 4: 빌드와 타입 검사를 실행한다**

Run: `npm run typecheck`

Expected: PASS

Run: `npm run build`

Expected: PASS and `dist/cli.js` exists

- [ ] **Step 5: 커밋한다**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/cli.ts src/server.ts
git commit -m "chore(project): TypeScript MCP 서버 기반을 구성한다"
```

## Task 2: 공통 타입, 응답 헬퍼, fixture 추가

**Files:**
- Create: `src/types.ts`
- Create: `src/result.ts`
- Create: `tests/fixtures/sample.ts`
- Create: `tests/fixtures/sample.js`
- Create: `tests/fixtures/sample.py`
- Create: `tests/result.test.ts`

- [ ] **Step 1: 응답 헬퍼 테스트를 작성한다**

Create `tests/result.test.ts`:

```ts
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- tests/result.test.ts`

Expected: FAIL with module resolution error for `src/result.ts`

- [ ] **Step 3: 공통 타입과 응답 헬퍼를 구현한다**

Create `src/types.ts`:

```ts
export type SupportedLanguage = 'javascript' | 'typescript' | 'tsx' | 'python';

export type SourcePosition = {
  row: number;
  column: number;
};

export type SourceRange = {
  start: SourcePosition;
  end: SourcePosition;
};

export type CodeSymbol = {
  name: string;
  kind: 'function' | 'method' | 'class' | 'variable' | 'interface' | 'type';
  range: SourceRange;
  selectionRange?: SourceRange;
  parentName?: string;
};

export type ToolErrorCode =
  | 'WORKSPACE_OUTSIDE_ROOT'
  | 'FILE_NOT_FOUND'
  | 'UNSUPPORTED_EXTENSION'
  | 'QUERY_ERROR'
  | 'PARSE_ERROR';

export type ToolFailure = {
  ok: false;
  error: {
    code: ToolErrorCode;
    message: string;
  };
};
```

Create `src/result.ts`:

```ts
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { ToolErrorCode, ToolFailure } from './types.js';

export function jsonResult<T extends Record<string, unknown>>(value: T): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}

export function toolFailure(code: ToolErrorCode, message: string): CallToolResult {
  const value: ToolFailure = { ok: false, error: { code, message } };
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true
  };
}
```

- [ ] **Step 4: fixture 파일을 작성한다**

Create `tests/fixtures/sample.ts`:

```ts
export interface User {
  id: string;
  name: string;
}

export type UserId = User['id'];

export class UserService {
  constructor(private readonly users: User[]) {}

  findUser(id: UserId): User | undefined {
    return this.users.find(user => user.id === id);
  }
}

export function formatUser(user: User): string {
  return `${user.id}:${user.name}`;
}

const defaultUser: User = { id: '1', name: 'Ada' };

formatUser(defaultUser);
```

Create `tests/fixtures/sample.js`:

```js
import path from 'node:path';

export class FileReporter {
  report(fileName) {
    return path.basename(fileName);
  }
}

export function makeReporter() {
  return new FileReporter();
}

const reporter = makeReporter();
reporter.report('/tmp/example.js');
```

Create `tests/fixtures/sample.py`:

```py
from dataclasses import dataclass


@dataclass
class User:
    id: str
    name: str


class UserRepository:
    def __init__(self, users: list[User]):
        self.users = users

    def find_user(self, user_id: str) -> User | None:
        for user in self.users:
            if user.id == user_id:
                return user
        return None


def format_user(user: User) -> str:
    return f"{user.id}:{user.name}"


default_user = User(id="1", name="Ada")
format_user(default_user)
```

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npm test -- tests/result.test.ts`

Expected: PASS

- [ ] **Step 6: 커밋한다**

```bash
git add src/types.ts src/result.ts tests/fixtures/sample.ts tests/fixtures/sample.js tests/fixtures/sample.py tests/result.test.ts
git commit -m "test(core): 공통 응답 헬퍼와 fixture를 추가한다"
```

## Task 3: `workspaceRoot` 보안 경계 구현

**Files:**
- Create: `src/workspace.ts`
- Create: `tests/workspace.test.ts`

- [ ] **Step 1: 경로 검증 테스트를 작성한다**

Create `tests/workspace.test.ts`:

```ts
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/workspace.js';

describe('workspace', () => {
  it('reads files inside workspaceRoot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    await writeFile(path.join(root, 'sample.ts'), 'export const value = 1;');
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile('sample.ts');

    expect(file.ok).toBe(true);
    if (file.ok) {
      expect(file.relativePath).toBe('sample.ts');
      expect(file.text).toContain('value');
    }
  });

  it('rejects paths outside workspaceRoot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    const outside = path.join(await realpath(tmpdir()), 'outside.ts');
    await writeFile(outside, 'export const leaked = true;');
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile(outside);

    expect(file).toEqual({
      ok: false,
      error: {
        code: 'WORKSPACE_OUTSIDE_ROOT',
        message: expect.stringContaining('outside workspaceRoot')
      }
    });
  });

  it('rejects unsupported extensions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-mcp-root-'));
    await writeFile(path.join(root, 'notes.md'), '# notes');
    const workspace = await createWorkspace(root);

    const file = await workspace.readSourceFile('notes.md');

    expect(file).toEqual({
      ok: false,
      error: {
        code: 'UNSUPPORTED_EXTENSION',
        message: expect.stringContaining('Unsupported extension')
      }
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- tests/workspace.test.ts`

Expected: FAIL with module resolution error for `src/workspace.ts`

- [ ] **Step 3: 워크스페이스 모듈을 구현한다**

Create `src/workspace.ts`:

```ts
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
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- tests/workspace.test.ts`

Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/workspace.ts tests/workspace.test.ts
git commit -m "feat(workspace): 파일 접근 보안 경계를 구현한다"
```

## Task 4: 언어 판별과 Tree-sitter 파싱 구현

**Files:**
- Create: `src/languages.ts`
- Create: `src/parser.ts`
- Create: `tests/parser.test.ts`

- [ ] **Step 1: 파싱 테스트를 작성한다**

Create `tests/parser.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/workspace.js';
import { detectLanguage, parseSourceFile } from '../src/parser.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('parser', () => {
  it.each([
    ['sample.js', 'javascript'],
    ['sample.ts', 'typescript'],
    ['sample.py', 'python']
  ] as const)('detects %s as %s', (fileName, expectedLanguage) => {
    expect(detectLanguage(fileName)).toEqual({ ok: true, language: expectedLanguage });
  });

  it('parses TypeScript fixture', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const file = await workspace.readSourceFile('sample.ts');
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    const parsed = parseSourceFile(file);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.language).toBe('typescript');
      expect(parsed.tree.rootNode.type).toBe('program');
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- tests/parser.test.ts`

Expected: FAIL with module resolution error for `src/parser.ts`

- [ ] **Step 3: 언어 로딩과 파싱을 구현한다**

Create `src/languages.ts`:

```ts
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import TypeScript from 'tree-sitter-typescript';
import type Parser from 'tree-sitter';
import type { SupportedLanguage } from './types.js';

type LanguageModule = {
  javascript?: Parser.Language;
  typescript?: Parser.Language;
  tsx?: Parser.Language;
  default?: Parser.Language;
};

const tsModule = TypeScript as unknown as LanguageModule;

export function languageForName(language: SupportedLanguage): Parser.Language {
  if (language === 'javascript') return JavaScript as Parser.Language;
  if (language === 'python') return Python as Parser.Language;
  if (language === 'typescript') return tsModule.typescript as Parser.Language;
  return tsModule.tsx as Parser.Language;
}
```

Create `src/parser.ts`:

```ts
import Parser from 'tree-sitter';
import path from 'node:path';
import { languageForName } from './languages.js';
import type { SourceFile, WorkspaceFailure } from './workspace.js';
import type { SupportedLanguage } from './types.js';

export type ParsedSourceFile = {
  ok: true;
  file: SourceFile;
  language: SupportedLanguage;
  tree: Parser.Tree;
};

export type ParseFailure = WorkspaceFailure | {
  ok: false;
  error: {
    code: 'UNSUPPORTED_EXTENSION' | 'PARSE_ERROR';
    message: string;
  };
};

export function detectLanguage(filePath: string):
  | { ok: true; language: SupportedLanguage }
  | { ok: false; error: { code: 'UNSUPPORTED_EXTENSION'; message: string } } {
  const extension = path.extname(filePath);
  if (extension === '.js' || extension === '.jsx') return { ok: true, language: 'javascript' };
  if (extension === '.ts') return { ok: true, language: 'typescript' };
  if (extension === '.tsx') return { ok: true, language: 'tsx' };
  if (extension === '.py') return { ok: true, language: 'python' };
  return {
    ok: false,
    error: { code: 'UNSUPPORTED_EXTENSION', message: `Unsupported extension: ${extension}` }
  };
}

export function parseSourceFile(file: SourceFile): ParsedSourceFile | ParseFailure {
  const detected = detectLanguage(file.absolutePath);
  if (!detected.ok) return detected;

  try {
    const parser = new Parser();
    parser.setLanguage(languageForName(detected.language));
    return {
      ok: true,
      file,
      language: detected.language,
      tree: parser.parse(file.text)
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- tests/parser.test.ts`

Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/languages.ts src/parser.ts tests/parser.test.ts
git commit -m "feat(parser): Tree-sitter 언어 판별과 파싱을 구현한다"
```

## Task 5: `run_query` 분석 기능 구현

**Files:**
- Modify: `src/parser.ts`
- Create: `src/analysis/query.ts`
- Create: `tests/query.test.ts`

- [ ] **Step 1: query 실행 테스트를 작성한다**

Create `tests/query.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runTreeSitterQuery } from '../src/analysis/query.js';
import { parseSourceFile } from '../src/parser.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('runTreeSitterQuery', () => {
  it('returns captures for a valid query', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const file = await workspace.readSourceFile('sample.py');
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    const parsed = parseSourceFile(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = runTreeSitterQuery(parsed, '(function_definition name: (identifier) @name)');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.captures.map(capture => capture.text)).toContain('format_user');
    }
  });

  it('returns structured failure for an invalid query', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const file = await workspace.readSourceFile('sample.ts');
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    const parsed = parseSourceFile(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = runTreeSitterQuery(parsed, '(');

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'QUERY_ERROR',
        message: expect.any(String)
      }
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- tests/query.test.ts`

Expected: FAIL with module resolution error for `src/analysis/query.ts`

- [ ] **Step 3: query 실행 모듈을 구현한다**

Create `src/analysis/query.ts`:

```ts
import Parser from 'tree-sitter';
import { languageForName } from '../languages.js';
import type { ParsedSourceFile } from '../parser.js';
import type { SourceRange } from '../types.js';

export type QueryCaptureResult = {
  name: string;
  nodeType: string;
  range: SourceRange;
  text: string;
};

export type QueryRunResult =
  | { ok: true; language: string; path: string; captures: QueryCaptureResult[] }
  | { ok: false; error: { code: 'QUERY_ERROR'; message: string } };

function nodeRange(node: Parser.SyntaxNode): SourceRange {
  return {
    start: { row: node.startPosition.row, column: node.startPosition.column },
    end: { row: node.endPosition.row, column: node.endPosition.column }
  };
}

export function runTreeSitterQuery(parsed: ParsedSourceFile, queryText: string): QueryRunResult {
  try {
    const query = new Parser.Query(languageForName(parsed.language), queryText);
    const captures = query.captures(parsed.tree.rootNode).map(capture => ({
      name: capture.name,
      nodeType: capture.node.type,
      range: nodeRange(capture.node),
      text: capture.node.text
    }));

    return {
      ok: true,
      language: parsed.language,
      path: parsed.file.relativePath,
      captures
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'QUERY_ERROR',
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- tests/query.test.ts`

Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/parser.ts src/analysis/query.ts tests/query.test.ts
git commit -m "feat(query): Tree-sitter query 실행 기능을 추가한다"
```

## Task 6: 심볼 추출과 `list_symbols` 기반 구현

**Files:**
- Create: `src/analysis/symbols.ts`
- Create: `tests/symbols.test.ts`

- [ ] **Step 1: 심볼 추출 테스트를 작성한다**

Create `tests/symbols.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSymbols } from '../src/analysis/symbols.js';
import { parseSourceFile } from '../src/parser.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

async function parseFixture(fileName: string) {
  const workspace = await createWorkspace(fixtureRoot);
  const file = await workspace.readSourceFile(fileName);
  expect(file.ok).toBe(true);
  if (!file.ok) throw new Error(file.error.message);
  const parsed = parseSourceFile(file);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed;
}

describe('listSymbols', () => {
  it('extracts TypeScript symbols', async () => {
    const symbols = listSymbols(await parseFixture('sample.ts'));

    expect(symbols.map(symbol => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining([
        'interface:User',
        'type:UserId',
        'class:UserService',
        'method:findUser',
        'function:formatUser',
        'variable:defaultUser'
      ])
    );
  });

  it('extracts Python symbols', async () => {
    const symbols = listSymbols(await parseFixture('sample.py'));

    expect(symbols.map(symbol => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining([
        'class:User',
        'class:UserRepository',
        'method:find_user',
        'function:format_user',
        'variable:default_user'
      ])
    );
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- tests/symbols.test.ts`

Expected: FAIL with module resolution error for `src/analysis/symbols.ts`

- [ ] **Step 3: 언어별 심볼 추출을 구현한다**

Create `src/analysis/symbols.ts`:

```ts
import type Parser from 'tree-sitter';
import type { ParsedSourceFile } from '../parser.js';
import type { CodeSymbol, SourceRange } from '../types.js';
import { runTreeSitterQuery } from './query.js';

const SYMBOL_QUERIES = {
  javascript: `
    (function_declaration name: (identifier) @function.name)
    (method_definition name: (property_identifier) @method.name)
    (class_declaration name: (identifier) @class.name)
    (lexical_declaration (variable_declarator name: (identifier) @variable.name))
    (variable_declaration (variable_declarator name: (identifier) @variable.name))
  `,
  typescript: `
    (function_declaration name: (identifier) @function.name)
    (method_definition name: (property_identifier) @method.name)
    (class_declaration name: (type_identifier) @class.name)
    (interface_declaration name: (type_identifier) @interface.name)
    (type_alias_declaration name: (type_identifier) @type.name)
    (lexical_declaration (variable_declarator name: (identifier) @variable.name))
    (variable_declaration (variable_declarator name: (identifier) @variable.name))
  `,
  tsx: `
    (function_declaration name: (identifier) @function.name)
    (method_definition name: (property_identifier) @method.name)
    (class_declaration name: (type_identifier) @class.name)
    (interface_declaration name: (type_identifier) @interface.name)
    (type_alias_declaration name: (type_identifier) @type.name)
    (lexical_declaration (variable_declarator name: (identifier) @variable.name))
    (variable_declaration (variable_declarator name: (identifier) @variable.name))
  `,
  python: `
    (function_definition name: (identifier) @function.name)
    (class_definition name: (identifier) @class.name)
    (assignment left: (identifier) @variable.name)
  `
} as const;

function nodeRange(node: Parser.SyntaxNode): SourceRange {
  return {
    start: { row: node.startPosition.row, column: node.startPosition.column },
    end: { row: node.endPosition.row, column: node.endPosition.column }
  };
}

function enclosingClassName(node: Parser.SyntaxNode): string | undefined {
  let current = node.parent;
  while (current) {
    if (current.type === 'class_declaration' || current.type === 'class_definition') {
      const nameNode = current.childForFieldName('name');
      return nameNode?.text;
    }
    current = current.parent;
  }
  return undefined;
}

export function listSymbols(parsed: ParsedSourceFile): CodeSymbol[] {
  const result = runTreeSitterQuery(parsed, SYMBOL_QUERIES[parsed.language]);
  if (!result.ok) return [];

  return result.captures.map(capture => {
    const [kind] = capture.name.split('.');
    const parentName = kind === 'function' && parsed.language === 'python'
      ? enclosingClassName(findNode(parsed.tree.rootNode, capture.range.start.row, capture.range.start.column))
      : undefined;

    return {
      name: capture.text,
      kind: parentName ? 'method' : kind as CodeSymbol['kind'],
      range: capture.range,
      selectionRange: capture.range,
      parentName
    };
  });
}

function findNode(node: Parser.SyntaxNode, row: number, column: number): Parser.SyntaxNode {
  const descendant = node.descendantForPosition({ row, column });
  return descendant ?? node;
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- tests/symbols.test.ts`

Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/analysis/symbols.ts tests/symbols.test.ts
git commit -m "feat(symbols): 주요 코드 심볼 추출을 구현한다"
```

## Task 7: 정의와 참조 후보 검색 구현

**Files:**
- Create: `src/analysis/definitions.ts`
- Create: `src/analysis/references.ts`
- Create: `tests/definitions.test.ts`
- Create: `tests/references.test.ts`

- [ ] **Step 1: 정의 검색 테스트를 작성한다**

Create `tests/definitions.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findDefinitions } from '../src/analysis/definitions.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('findDefinitions', () => {
  it('finds definitions by symbol name across files', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const definitions = await findDefinitions(workspace, {
      name: 'UserService',
      paths: ['sample.ts', 'sample.py']
    });

    expect(definitions.ok).toBe(true);
    if (definitions.ok) {
      expect(definitions.definitions).toEqual([
        expect.objectContaining({
          path: 'sample.ts',
          name: 'UserService',
          kind: 'class'
        })
      ]);
    }
  });
});
```

- [ ] **Step 2: 참조 검색 테스트를 작성한다**

Create `tests/references.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findReferences } from '../src/analysis/references.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('findReferences', () => {
  it('finds identifier references by name across files', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const references = await findReferences(workspace, {
      name: 'formatUser',
      paths: ['sample.ts', 'sample.js']
    });

    expect(references.ok).toBe(true);
    if (references.ok) {
      expect(references.references.length).toBeGreaterThanOrEqual(2);
      expect(references.references.every(reference => reference.name === 'formatUser')).toBe(true);
    }
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npm test -- tests/definitions.test.ts tests/references.test.ts`

Expected: FAIL with module resolution errors for definitions and references modules

- [ ] **Step 4: 정의 검색을 구현한다**

Create `src/analysis/definitions.ts`:

```ts
import type { Workspace } from '../workspace.js';
import { parseSourceFile } from '../parser.js';
import type { CodeSymbol, SourceRange } from '../types.js';
import { listSymbols } from './symbols.js';

export type DefinitionResult = {
  path: string;
  name: string;
  kind: CodeSymbol['kind'];
  range: SourceRange;
  snippet: string;
};

export type FindDefinitionsInput = {
  name: string;
  paths: string[];
  kinds?: CodeSymbol['kind'][];
};

export async function findDefinitions(workspace: Workspace, input: FindDefinitionsInput):
  Promise<{ ok: true; definitions: DefinitionResult[] } | { ok: false; error: { code: string; message: string } }> {
  const definitions: DefinitionResult[] = [];

  for (const path of input.paths) {
    const file = await workspace.readSourceFile(path);
    if (!file.ok) return file;
    const parsed = parseSourceFile(file);
    if (!parsed.ok) return parsed;

    for (const symbol of listSymbols(parsed)) {
      if (symbol.name !== input.name) continue;
      if (input.kinds && !input.kinds.includes(symbol.kind)) continue;
      definitions.push({
        path: file.relativePath,
        name: symbol.name,
        kind: symbol.kind,
        range: symbol.range,
        snippet: lineAt(file.text, symbol.range.start.row)
      });
    }
  }

  return { ok: true, definitions };
}

function lineAt(text: string, row: number): string {
  return text.split(/\r?\n/)[row]?.trim() ?? '';
}
```

- [ ] **Step 5: 참조 검색을 구현한다**

Create `src/analysis/references.ts`:

```ts
import type { ParsedSourceFile } from '../parser.js';
import { parseSourceFile } from '../parser.js';
import type { SourceRange } from '../types.js';
import type { Workspace } from '../workspace.js';
import { runTreeSitterQuery } from './query.js';

export type ReferenceResult = {
  path: string;
  name: string;
  nodeType: string;
  range: SourceRange;
  snippet: string;
};

export type FindReferencesInput = {
  name: string;
  paths: string[];
};

const IDENTIFIER_QUERY = {
  javascript: '(identifier) @identifier',
  typescript: '[(identifier) (type_identifier)] @identifier',
  tsx: '[(identifier) (type_identifier)] @identifier',
  python: '(identifier) @identifier'
} as const;

export async function findReferences(workspace: Workspace, input: FindReferencesInput):
  Promise<{ ok: true; references: ReferenceResult[] } | { ok: false; error: { code: string; message: string } }> {
  const references: ReferenceResult[] = [];

  for (const path of input.paths) {
    const file = await workspace.readSourceFile(path);
    if (!file.ok) return file;
    const parsed = parseSourceFile(file);
    if (!parsed.ok) return parsed;

    references.push(...referencesInFile(parsed, input.name));
  }

  return { ok: true, references };
}

function referencesInFile(parsed: ParsedSourceFile, name: string): ReferenceResult[] {
  const result = runTreeSitterQuery(parsed, IDENTIFIER_QUERY[parsed.language]);
  if (!result.ok) return [];

  return result.captures
    .filter(capture => capture.text === name)
    .map(capture => ({
      path: parsed.file.relativePath,
      name,
      nodeType: capture.nodeType,
      range: capture.range,
      snippet: lineAt(parsed.file.text, capture.range.start.row)
    }));
}

function lineAt(text: string, row: number): string {
  return text.split(/\r?\n/)[row]?.trim() ?? '';
}
```

- [ ] **Step 6: 테스트를 통과시킨다**

Run: `npm test -- tests/definitions.test.ts tests/references.test.ts`

Expected: PASS

- [ ] **Step 7: 커밋한다**

```bash
git add src/analysis/definitions.ts src/analysis/references.ts tests/definitions.test.ts tests/references.test.ts
git commit -m "feat(search): 정의와 참조 후보 검색을 구현한다"
```

## Task 8: 파일 요약과 LLM 컨텍스트 생성 구현

**Files:**
- Create: `src/analysis/summary.ts`
- Create: `src/analysis/context.ts`
- Create: `tests/summary.test.ts`
- Create: `tests/context.test.ts`

- [ ] **Step 1: 파일 요약 테스트를 작성한다**

Create `tests/summary.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarizeFile } from '../src/analysis/summary.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('summarizeFile', () => {
  it('summarizes file structure', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const summary = await summarizeFile(workspace, 'sample.ts');

    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.path).toBe('sample.ts');
      expect(summary.language).toBe('typescript');
      expect(summary.symbols.map(symbol => symbol.name)).toContain('UserService');
      expect(summary.lineCount).toBeGreaterThan(1);
    }
  });
});
```

- [ ] **Step 2: 컨텍스트 생성 테스트를 작성한다**

Create `tests/context.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/analysis/context.js';
import { createWorkspace } from '../src/workspace.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('buildContext', () => {
  it('builds compact markdown context for files', async () => {
    const workspace = await createWorkspace(fixtureRoot);
    const context = await buildContext(workspace, {
      paths: ['sample.ts', 'sample.py'],
      detail: 'compact'
    });

    expect(context.ok).toBe(true);
    if (context.ok) {
      expect(context.markdown).toContain('## sample.ts');
      expect(context.markdown).toContain('class UserService');
      expect(context.markdown).toContain('function format_user');
    }
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npm test -- tests/summary.test.ts tests/context.test.ts`

Expected: FAIL with module resolution errors for summary and context modules

- [ ] **Step 4: 파일 요약을 구현한다**

Create `src/analysis/summary.ts`:

```ts
import { parseSourceFile } from '../parser.js';
import type { CodeSymbol } from '../types.js';
import type { Workspace } from '../workspace.js';
import { listSymbols } from './symbols.js';

export type FileSummary = {
  ok: true;
  path: string;
  language: string;
  lineCount: number;
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
};

export async function summarizeFile(workspace: Workspace, path: string):
  Promise<FileSummary | { ok: false; error: { code: string; message: string } }> {
  const file = await workspace.readSourceFile(path);
  if (!file.ok) return file;
  const parsed = parseSourceFile(file);
  if (!parsed.ok) return parsed;

  const lines = file.text.split(/\r?\n/);
  return {
    ok: true,
    path: file.relativePath,
    language: parsed.language,
    lineCount: lines.length,
    symbols: listSymbols(parsed),
    imports: lines.map(line => line.trim()).filter(line => line.startsWith('import ') || line.startsWith('from ')),
    exports: lines.map(line => line.trim()).filter(line => line.startsWith('export '))
  };
}
```

- [ ] **Step 5: 컨텍스트 생성을 구현한다**

Create `src/analysis/context.ts`:

```ts
import type { Workspace } from '../workspace.js';
import { summarizeFile } from './summary.js';

export type BuildContextInput = {
  paths: string[];
  detail: 'compact' | 'full';
};

export async function buildContext(workspace: Workspace, input: BuildContextInput):
  Promise<{ ok: true; markdown: string } | { ok: false; error: { code: string; message: string } }> {
  const sections: string[] = ['# Code Context'];

  for (const filePath of input.paths) {
    const summary = await summarizeFile(workspace, filePath);
    if (!summary.ok) return summary;

    sections.push(`## ${summary.path}`);
    sections.push(`Language: ${summary.language}`);
    sections.push(`Lines: ${summary.lineCount}`);
    sections.push('');
    sections.push('Symbols:');
    for (const symbol of summary.symbols) {
      sections.push(`- ${symbol.kind} ${symbol.name} (${symbol.range.start.row + 1}:${symbol.range.start.column + 1})`);
    }

    if (input.detail === 'full') {
      if (summary.imports.length > 0) {
        sections.push('');
        sections.push('Imports:');
        for (const importLine of summary.imports) sections.push(`- ${importLine}`);
      }
      if (summary.exports.length > 0) {
        sections.push('');
        sections.push('Exports:');
        for (const exportLine of summary.exports) sections.push(`- ${exportLine}`);
      }
    }

    sections.push('');
  }

  return { ok: true, markdown: sections.join('\n') };
}
```

- [ ] **Step 6: 테스트를 통과시킨다**

Run: `npm test -- tests/summary.test.ts tests/context.test.ts`

Expected: PASS

- [ ] **Step 7: 커밋한다**

```bash
git add src/analysis/summary.ts src/analysis/context.ts tests/summary.test.ts tests/context.test.ts
git commit -m "feat(context): 파일 요약과 LLM 컨텍스트 생성을 구현한다"
```

## Task 9: MCP tool 6개 등록과 README 작성

**Files:**
- Create: `src/tools.ts`
- Modify: `src/server.ts`
- Create: `tests/tools.test.ts`
- Create: `README.md`

- [ ] **Step 1: tool handler 테스트를 작성한다**

Create `tests/tools.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/workspace.js';
import { createToolHandlers } from '../src/tools.js';

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures');

describe('tool handlers', () => {
  it('handles list_symbols', async () => {
    const handlers = createToolHandlers(await createWorkspace(fixtureRoot));
    const result = await handlers.listSymbols({ path: 'sample.ts' });

    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        path: 'sample.ts',
        language: 'typescript'
      })
    );
  });

  it('handles run_query errors as tool failures', async () => {
    const handlers = createToolHandlers(await createWorkspace(fixtureRoot));
    const result = await handlers.runQuery({ path: 'sample.ts', query: '(' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'QUERY_ERROR' })
      })
    );
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- tests/tools.test.ts`

Expected: FAIL with module resolution error for `src/tools.ts`

- [ ] **Step 3: tool handler와 등록 함수를 구현한다**

Create `src/tools.ts`:

```ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { findDefinitions as findDefinitionCandidates } from './analysis/definitions.js';
import { findReferences as findReferenceCandidates } from './analysis/references.js';
import { runTreeSitterQuery } from './analysis/query.js';
import { listSymbols } from './analysis/symbols.js';
import { summarizeFile } from './analysis/summary.js';
import { buildContext as buildCodeContext } from './analysis/context.js';
import { parseSourceFile } from './parser.js';
import { jsonResult, toolFailure } from './result.js';
import type { ToolErrorCode } from './types.js';
import type { Workspace } from './workspace.js';

const pathInput = z.object({ path: z.string().min(1) });

export function createToolHandlers(workspace: Workspace) {
  return {
    async listSymbols(input: z.infer<typeof pathInput>) {
      const file = await workspace.readSourceFile(input.path);
      if (!file.ok) return toolFailure(file.error.code, file.error.message);
      const parsed = parseSourceFile(file);
      if (!parsed.ok) return toolFailure(parsed.error.code, parsed.error.message);
      return jsonResult({
        ok: true,
        path: file.relativePath,
        language: parsed.language,
        symbols: listSymbols(parsed)
      });
    },

    async findDefinition(input: { name: string; paths: string[]; kinds?: string[] }) {
      const result = await findDefinitionCandidates(workspace, input);
      if (!result.ok) return toolFailure(result.error.code as ToolErrorCode, result.error.message);
      return jsonResult({ ok: true, definitions: result.definitions });
    },

    async findReferences(input: { name: string; paths: string[] }) {
      const result = await findReferenceCandidates(workspace, input);
      if (!result.ok) return toolFailure(result.error.code as ToolErrorCode, result.error.message);
      return jsonResult({ ok: true, references: result.references });
    },

    async summarizeFile(input: z.infer<typeof pathInput>) {
      const result = await summarizeFile(workspace, input.path);
      if (!result.ok) return toolFailure(result.error.code as ToolErrorCode, result.error.message);
      return jsonResult(result);
    },

    async runQuery(input: { path: string; query: string }) {
      const file = await workspace.readSourceFile(input.path);
      if (!file.ok) return toolFailure(file.error.code, file.error.message);
      const parsed = parseSourceFile(file);
      if (!parsed.ok) return toolFailure(parsed.error.code, parsed.error.message);
      const result = runTreeSitterQuery(parsed, input.query);
      if (!result.ok) return toolFailure(result.error.code, result.error.message);
      return jsonResult(result);
    },

    async buildContext(input: { paths: string[]; detail: 'compact' | 'full' }) {
      const result = await buildCodeContext(workspace, input);
      if (!result.ok) return toolFailure(result.error.code as ToolErrorCode, result.error.message);
      return jsonResult(result);
    }
  };
}

export function registerTools(server: McpServer, workspace: Workspace): void {
  const handlers = createToolHandlers(workspace);

  server.registerTool('list_symbols', {
    title: 'List Symbols',
    description: 'List functions, classes, methods, variables, interfaces, and types in one source file.',
    inputSchema: pathInput
  }, handlers.listSymbols);

  server.registerTool('find_definition', {
    title: 'Find Definition',
    description: 'Find definition candidates for a symbol name in the provided files.',
    inputSchema: z.object({
      name: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1),
      kinds: z.array(z.string()).optional()
    })
  }, handlers.findDefinition);

  server.registerTool('find_references', {
    title: 'Find References',
    description: 'Find identifier reference candidates for a name in the provided files.',
    inputSchema: z.object({
      name: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1)
    })
  }, handlers.findReferences);

  server.registerTool('summarize_file', {
    title: 'Summarize File',
    description: 'Return a compact structural summary for one source file.',
    inputSchema: pathInput
  }, handlers.summarizeFile);

  server.registerTool('run_query', {
    title: 'Run Tree-sitter Query',
    description: 'Run a Tree-sitter query against one source file.',
    inputSchema: z.object({
      path: z.string().min(1),
      query: z.string().min(1)
    })
  }, handlers.runQuery);

  server.registerTool('build_context', {
    title: 'Build Code Context',
    description: 'Build Markdown context from source file summaries for LLM consumption.',
    inputSchema: z.object({
      paths: z.array(z.string().min(1)).min(1),
      detail: z.enum(['compact', 'full']).default('compact')
    })
  }, handlers.buildContext);
}
```

- [ ] **Step 4: 서버에서 workspace와 tool 등록을 연결한다**

Modify `src/server.ts`:

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { registerTools } from './tools.js';
import { createWorkspace } from './workspace.js';

export type ServerOptions = {
  workspaceRoot: string;
};

export async function createServer(options: ServerOptions): Promise<McpServer> {
  const workspace = await createWorkspace(options.workspaceRoot);
  const server = new McpServer(
    { name: 'tree-sitter-code-analysis', version: '0.1.0' },
    {
      instructions:
        'Analyze JavaScript, TypeScript, and Python source files under the configured workspaceRoot only.'
    }
  );

  registerTools(server, workspace);
  return server;
}

export async function runServer(options: ServerOptions): Promise<void> {
  const server = await createServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 5: README를 작성한다**

Create `README.md`:

```md
# Tree-sitter Code Analysis MCP

TypeScript 기반 MCP 서버입니다. Tree-sitter로 JavaScript, TypeScript, Python 파일을 온디맨드로 파싱하고 코드 구조 분석 tool을 제공합니다.

## 설치

```bash
npm install
npm run build
```

## 실행

```bash
node dist/cli.js --workspace-root /absolute/path/to/project
```

`--workspace-root`를 생략하면 `WORKSPACE_ROOT` 환경 변수를 사용하고, 환경 변수도 없으면 현재 작업 디렉터리를 사용합니다.

## 제공 tool

- `list_symbols`: 파일의 주요 심볼 목록
- `find_definition`: 지정한 파일 목록에서 정의 후보 검색
- `find_references`: 지정한 파일 목록에서 참조 후보 검색
- `summarize_file`: 파일 구조 요약
- `run_query`: Tree-sitter query 실행
- `build_context`: LLM용 Markdown 코드 컨텍스트 생성

## MCP 설정 예시

```json
{
  "mcpServers": {
    "tree-sitter-code-analysis": {
      "command": "node",
      "args": [
        "/absolute/path/to/tree-sitter-code-analysis-mcp/dist/cli.js",
        "--workspace-root",
        "/absolute/path/to/project"
      ]
    }
  }
}
```

## 보안 경계

서버는 `workspaceRoot` 내부의 `.js`, `.jsx`, `.ts`, `.tsx`, `.py` 파일만 읽습니다. 루트 밖 경로나 지원하지 않는 확장자는 거부합니다.
```

- [ ] **Step 6: 테스트와 빌드를 통과시킨다**

Run: `npm test`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 7: 커밋한다**

```bash
git add src/tools.ts src/server.ts tests/tools.test.ts README.md
git commit -m "feat(mcp): 코드 분석 MCP tool을 등록한다"
```

## Task 10: 최종 검증과 보정

**Files:**
- Modify only files touched by Tasks 1-9 if verification exposes issues.

- [ ] **Step 1: 전체 테스트를 실행한다**

Run: `npm test`

Expected: PASS

- [ ] **Step 2: 타입 검사를 실행한다**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 3: 프로덕션 빌드를 실행한다**

Run: `npm run build`

Expected: PASS

- [ ] **Step 4: 서버 시작 smoke test를 실행한다**

Run: `node dist/cli.js --workspace-root tests/fixtures`

Expected: 프로세스가 stdio MCP 서버로 대기한다. 수동 종료는 `Ctrl+C`로 한다.

- [ ] **Step 5: 보정 사항이 있으면 커밋한다**

```bash
git status --short
git add <changed-files>
git commit -m "fix(mcp): 최종 검증에서 발견한 문제를 수정한다"
```

If `git status --short` has no output, skip this commit step.

## Spec Coverage Review

- JS/TS/Python 파싱: Task 4
- MCP tool 6개: Task 9
- 함수/클래스/메서드 등 심볼 목록: Task 6, Task 9
- 정의 위치 찾기: Task 7, Task 9
- 참조 위치 찾기: Task 7, Task 9
- 파일 구조 요약: Task 8, Task 9
- Tree-sitter query 실행: Task 5, Task 9
- LLM 컨텍스트 생성: Task 8, Task 9
- `workspaceRoot` 내부 파일만 읽기: Task 3
- 구조화 JSON 결과: Task 2, Task 9
- fixture 기반 테스트: Task 2-10
- 전체 인덱싱과 파일 변경 감지 제외: Task 전체가 파일 단위 온디맨드 호출로 구성됨
