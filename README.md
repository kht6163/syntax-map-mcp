# syntax-map-mcp

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

- `list_symbols`: 파일 하나의 top-level 심볼 목록 반환
- `find_definition`: 여러 파일에서 이름과 선택적 kind로 정의 검색
- `find_references`: 여러 파일에서 식별자 참조 검색
- `summarize_file`: 파일 언어, 라인 수, imports, exports, symbols 요약
- `run_query`: 파일 하나에 tree-sitter query 실행
- `build_context`: 여러 파일 요약을 markdown 컨텍스트로 구성
- `index_workspace`: 지원 소스 파일을 파싱해 SQLite 심볼 인덱스 생성 또는 갱신
- `search_symbols`: SQLite 인덱스에서 심볼 이름 검색
- `get_index_status`: 인덱스 경로, 인덱싱된 파일 수, 심볼 수, stale 파일 수 반환
- `clear_index`: SQLite 인덱스 파일 삭제

## SQLite 인덱스

`index_workspace`는 `workspaceRoot` 아래의 `.syntax-map-mcp/index.sqlite`에 인덱스를 저장합니다. 인덱싱 대상은 `.js`, `.jsx`, `.ts`, `.tsx`, `.py` 파일이며, `.git`, `.syntax-map-mcp`, `dist`, `node_modules` 디렉터리는 제외합니다.

파일 변경 여부는 `mtimeMs`와 `size`로 판단합니다. 다시 `index_workspace`를 호출하면 변경된 파일만 재파싱하고, 삭제된 파일은 인덱스에서 제거합니다. 자동 watch 모드는 아직 포함하지 않았습니다.

## MCP 설정 예시

```json
{
  "mcpServers": {
    "syntax-map-mcp": {
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
