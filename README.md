# Tree-sitter Code Analysis MCP

Tree-sitter 기반 코드 분석 MCP 서버입니다. 지정한 `workspaceRoot` 아래의 JavaScript, TypeScript, TSX, Python 소스 파일을 읽고 심볼, 정의, 참조, 요약, tree-sitter query, 컨텍스트 markdown을 제공합니다.

## 설치와 빌드

```bash
npm install
npm run build
```

개발 중 검증:

```bash
npm test
npm run typecheck
```

## 실행

```bash
node dist/cli.js --workspace-root /path/to/workspace
```

`workspaceRoot` 결정 순서:

1. `--workspace-root` 인자
2. `WORKSPACE_ROOT` 환경 변수
3. 현재 작업 디렉터리

## 제공 도구

- `listSymbols`: 파일 하나의 top-level 심볼 목록 반환
- `findDefinition`: 여러 파일에서 이름과 선택적 kind로 정의 검색
- `findReferences`: 여러 파일에서 식별자 참조 검색
- `summarizeFile`: 파일 언어, 라인 수, imports, exports, symbols 요약
- `runQuery`: 파일 하나에 tree-sitter query 실행
- `buildContext`: 여러 파일 요약을 markdown 컨텍스트로 구성

## MCP 설정 예시

```json
{
  "mcpServers": {
    "tree-sitter-code-analysis": {
      "command": "node",
      "args": [
        "/Users/hantaekim/my-project/tree-sitter/dist/cli.js",
        "--workspace-root",
        "/path/to/workspace"
      ]
    }
  }
}
```

## 보안 경계

서버는 `workspaceRoot` 내부 파일만 읽습니다. 지원 확장자는 `.js`, `.jsx`, `.ts`, `.tsx`, `.py`뿐이며, workspace 밖으로 나가는 경로나 지원하지 않는 확장자는 오류로 처리합니다.
