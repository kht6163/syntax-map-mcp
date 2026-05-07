# Tool Reference

syntax-map-mcp의 주요 MCP 도구 입력과 응답 예시입니다. 응답 예시는 핵심 필드만 보여줍니다.

## list_symbols

입력:

```json
{
  "path": "src/index.ts"
}
```

응답 일부:

```json
{
  "ok": true,
  "path": "src/index.ts",
  "language": "typescript",
  "symbols": [
    {
      "name": "main",
      "kind": "function",
      "line": 3,
      "column": 1
    }
  ]
}
```

## find_definition

입력:

```json
{
  "name": "UserService",
  "paths": ["src/users.ts", "src/index.ts"],
  "kinds": ["class"]
}
```

응답 일부:

```json
{
  "ok": true,
  "definitions": [
    {
      "path": "src/users.ts",
      "name": "UserService",
      "kind": "class"
    }
  ]
}
```

## find_references

입력:

```json
{
  "name": "formatUser",
  "paths": ["src/users.ts", "src/index.ts"]
}
```

응답 일부:

```json
{
  "ok": true,
  "references": [
    {
      "path": "src/index.ts",
      "name": "formatUser",
      "nodeType": "identifier"
    }
  ]
}
```

## summarize_file

입력:

```json
{
  "path": "src/index.ts"
}
```

응답 일부:

```json
{
  "ok": true,
  "path": "src/index.ts",
  "language": "typescript",
  "imports": ["import { createServer } from './server.js';"],
  "exports": ["export async function main() {"],
  "sources": {
    "symbols": "ast",
    "imports": "ast",
    "exports": "ast"
  }
}
```

## run_query

입력:

```json
{
  "path": "src/users.ts",
  "query": "(class_declaration name: (type_identifier) @class.name)"
}
```

응답 일부:

```json
{
  "ok": true,
  "matches": [
    {
      "pattern": 0,
      "captures": [
        {
          "name": "class.name",
          "text": "UserService"
        }
      ]
    }
  ]
}
```

## build_context

파일 경로 기반 입력:

```json
{
  "paths": ["src/users.ts", "src/index.ts"],
  "detail": "compact"
}
```

인덱스 심볼 검색 기반 입력:

```json
{
  "detail": "compact",
  "maxFiles": 3,
  "indexedSearch": {
    "query": "UserService",
    "kinds": ["class"],
    "refreshIfStale": true,
    "contextBefore": 1,
    "contextAfter": 1
  }
}
```

인덱스 참조 검색 기반 입력:

```json
{
  "detail": "compact",
  "maxFiles": 3,
  "indexedSearch": {
    "mode": "references",
    "name": "formatUser",
    "refreshIfStale": true,
    "contextBefore": 1,
    "contextAfter": 1
  }
}
```

응답 일부:

```json
{
  "ok": true,
  "metadata": {
    "indexedSearchMode": "symbols",
    "indexPath": "/workspace/.syntax-map-mcp/index.sqlite",
    "isStale": false,
    "staleFiles": 0,
    "refreshed": true,
    "total": 1,
    "summarizedFiles": 1,
    "omittedFiles": 0
  },
  "markdown": "# Code Context\n\n## Indexed Search Results\n\n### UserService\n\nsrc/users.ts:8\n\n```typescript\nexport class UserService {\n```"
}
```

## index_workspace

입력:

```json
{}
```

응답 일부:

```json
{
  "ok": true,
  "schemaVersion": 1,
  "indexedFiles": 12,
  "symbols": 84,
  "references": 231,
  "indexPath": "/workspace/.syntax-map-mcp/index.sqlite"
}
```

## search_symbols

입력:

```json
{
  "query": "UserService",
  "kinds": ["class"],
  "refreshIfStale": true,
  "contextBefore": 2,
  "contextAfter": 2,
  "includePreview": true
}
```

응답 일부:

```json
{
  "ok": true,
  "isStale": false,
  "refreshed": true,
  "symbols": [
    {
      "path": "src/users.ts",
      "name": "UserService",
      "kind": "class",
      "snippet": "export class UserService {",
      "context": {
        "before": ["export type UserId = User['id'];", ""],
        "after": ["  constructor(private readonly users: User[]) {}", ""]
      },
      "previewMarkdown": "src/users.ts:8\n\n```typescript\nexport type UserId = User['id'];\n\nexport class UserService {\n  constructor(private readonly users: User[]) {}\n\n```"
    }
  ]
}
```

## find_indexed_definition

입력:

```json
{
  "name": "UserService",
  "refreshIfStale": true,
  "contextBefore": 1,
  "contextAfter": 1
}
```

응답 일부:

```json
{
  "ok": true,
  "total": 1,
  "definitions": [
    {
      "path": "src/users.ts",
      "name": "UserService",
      "kind": "class",
      "snippet": "export class UserService {"
    }
  ]
}
```

## find_indexed_references

입력:

```json
{
  "name": "formatUser",
  "limit": 20,
  "refreshIfStale": true
}
```

응답 일부:

```json
{
  "ok": true,
  "references": [
    {
      "path": "src/users.ts",
      "name": "formatUser",
      "nodeType": "identifier",
      "snippet": "formatUser(defaultUser);"
    }
  ]
}
```

## get_index_status

입력:

```json
{}
```

응답 일부:

```json
{
  "ok": true,
  "schemaVersion": 1,
  "indexedFiles": 12,
  "symbols": 84,
  "references": 231,
  "staleFiles": 2,
  "staleReasons": [
    {
      "path": "src/users.ts",
      "reason": "changed"
    },
    {
      "path": "src/old.ts",
      "reason": "missing"
    }
  ]
}
```

## clear_index

입력:

```json
{}
```

응답 일부:

```json
{
  "ok": true,
  "indexPath": "/workspace/.syntax-map-mcp/index.sqlite",
  "deleted": true
}
```
