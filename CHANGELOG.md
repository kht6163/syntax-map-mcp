# Changelog

## Unreleased

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
