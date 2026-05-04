# Tool Reference

syntax-map-mcp의 주요 MCP 도구 입력과 응답 예시입니다. 응답 예시는 핵심 필드만 보여줍니다.

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
    "total": 1
  },
  "markdown": "# Code Context\n\n## Indexed Search Results\n\n### UserService\n\nsrc/users.ts:8\n\n```typescript\nexport class UserService {\n```"
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
  "indexedFiles": 12,
  "symbols": 84,
  "references": 231,
  "staleFiles": 0
}
```
