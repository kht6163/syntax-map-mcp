# Changelog

## Unreleased

## 0.4.0 - 2026-05-07

- `lsp_definition` 도구를 추가해 LSP 위치의 식별자 정의 위치를 반환하도록 했습니다.

## 0.3.0 - 2026-05-07

- `lsp_document_symbols` 도구를 추가해 Tree-sitter 심볼을 LSP DocumentSymbol 형태로 반환하도록 했습니다.

## 0.2.0 - 2026-05-07

- `get_ast_tree` 도구를 추가해 지원 소스 파일의 tree-sitter AST를 depth 제한 JSON 트리로 반환하도록 했습니다.

## 0.1.9 - 2026-05-07

- 잘못된 인덱스 검색 옵션 오류 메시지에 실제 입력값을 포함하도록 개선했습니다.
- 인덱스 검색 옵션의 `limit`, `contextBefore`, `contextAfter` 범위를 분석 계층에서도 검증하도록 했습니다.
- 인덱스 저장 실패 시 tool failure 응답 shape를 검증하는 테스트를 추가했습니다.
- 주요 인덱스 도구의 `structuredContent` 응답 shape를 검증하는 테스트를 추가했습니다.
- `get_index_status` 응답에 stale 파일별 이유(`changed`, `missing`)를 반환하는 `staleReasons`를 추가했습니다.
- SQLite 인덱스 DB에 schema version metadata를 저장하고, 호환되지 않는 기존 인덱스는 자동 재생성하도록 했습니다.

## 0.1.8 - 2026-05-07

- `docs/tools.md`의 도구 목록이 실제 MCP `listTools()` 응답과 일치하는지 검증하도록 했습니다.
- MCP `listTools()` 응답의 공개 tool 이름과 주요 input schema 필드를 검증하는 테스트를 추가했습니다.
- `release:check`가 npm 패키지를 tarball로 설치한 뒤 MCP 초기화 응답을 확인하는 smoke test를 실행하도록 했습니다.

## 0.1.7 - 2026-05-07

- `release:check`가 npm 패키징 dry-run 결과의 필수 파일 포함 여부를 자동 검증하도록 했습니다.
- MCP 서버 metadata의 version이 `package.json` 버전과 동기화되도록 했습니다.

## 0.1.6 - 2026-05-06

- 하위 디렉터리의 `.gitignore` 패턴도 인덱싱 대상 파일 제외에 반영하도록 했습니다.

## 0.1.5 - 2026-05-06

- `express-rate-limit` transitive 의존성을 override해 npm audit 취약점 경고를 제거했습니다.
- `index_workspace`가 `workspaceRoot`의 `.gitignore` 패턴에 매칭되는 소스 파일을 인덱싱 대상에서 제외하도록 했습니다.

## 0.1.4 - 2026-05-04

- `build_context` 인덱스 검색 metadata에 `summarizedFiles`와 `omittedFiles`를 추가했습니다.
- `build_context`에 `maxFiles` 옵션을 추가해 인덱스 검색 기반 파일 요약 수를 제한할 수 있게 했습니다.
- 인덱스 기반 심볼/정의/참조 검색 결과를 소스 위치 기준으로 안정 정렬하도록 했습니다.
- `build_context`의 인덱스 검색 응답에 `metadata`를 추가해 stale 상태와 refresh 여부를 확인할 수 있게 했습니다.
- `build_context.indexedSearch`가 symbols 모드와 references 모드를 모두 지원하도록 확장했습니다.
- README의 도구별 입력/응답 예시를 `docs/tools.md`로 분리했습니다.
- npm 패키지에 `docs/tools.md`를 포함해 README의 도구 레퍼런스 링크가 패키지 안에서도 유지되도록 했습니다.

## 0.1.3 - 2026-05-04

- README에 `summarize_file`, 인덱스 검색 도구, `get_index_status`의 입력/응답 예시를 추가했습니다.
- Python 파일의 `summarize_file.exports`가 top-level `__all__`을 기준으로 반환되는 동작을 문서화했습니다.
- 배포 전 `typecheck`, 테스트, 빌드, 패키징 dry-run을 한 번에 실행하는 `release:check` 스크립트를 추가했습니다.
- Python 파일의 top-level `__all__` 문자열 이름을 `summarize_file.exports`로 반환하도록 했습니다.
- 인덱스 검색 도구에 `includePreview` 옵션을 추가해 `previewMarkdown`을 반환할 수 있게 했습니다.
- `build_context`가 `indexedSearch` 입력으로 인덱스 검색 결과 기반 markdown 컨텍스트를 만들 수 있게 했습니다.
- 패키지 버전을 `0.1.3`으로 올렸습니다.

## 0.1.2 - 2026-05-04

- `summarize_file`의 `exports` 추출을 AST 기반으로 변경해 문자열 내부 텍스트가 export로 잘못 반환되지 않도록 했습니다.
- `summarize_file` 응답에 `sources`를 추가해 `symbols`, `imports`, `exports` 추출 방식이 AST 기반임을 확인할 수 있게 했습니다.
- 인덱스 검색 도구에 `contextBefore`, `contextAfter` 옵션을 추가해 snippet 주변 라인을 함께 조회할 수 있게 했습니다.
- 패키지 버전을 `0.1.2`로 올렸습니다.
- `search_symbols` 결과에 현재 파일의 해당 줄 `snippet`을 추가했습니다.
- `find_indexed_references`를 추가해 SQLite 인덱스에서 식별자 참조를 검색할 수 있게 했습니다.
- `search_symbols`, `find_indexed_definition`, `find_indexed_references`가 `isStale`, `staleFiles`, `refreshed`를 반환하도록 했습니다.
- 인덱스 검색 도구에 `refreshIfStale` 옵션을 추가했습니다.
- `index_workspace`와 `get_index_status` 응답에 참조 인덱스 개수 `references`를 추가했습니다.

## 0.1.1 - 2026-05-04

- `find_indexed_definition`을 추가해 SQLite 인덱스에서 정확한 심볼 정의와 `snippet`을 조회할 수 있게 했습니다.
- README의 실행 예시와 MCP 설정 예시를 `npx -y syntax-map-mcp` 기반으로 변경했습니다.
- npm 페이지에서 GitHub 저장소가 노출되도록 `repository`, `homepage`, `bugs`, `license` 메타데이터를 추가했습니다.
- npm publish 경고를 피하도록 `bin` 경로를 `dist/cli.js` 형식으로 정규화했습니다.

## 0.1.0 - 2026-05-04

- Tree-sitter 기반 MCP 서버 초기 버전을 배포했습니다.
- JavaScript, TypeScript, TSX, Python 파일의 심볼, 정의, 참조, 요약, tree-sitter query, 컨텍스트 생성을 지원했습니다.
- SQLite 기반 workspace 심볼 인덱스를 추가했습니다.
