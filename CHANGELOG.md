# Changelog

## Unreleased

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
