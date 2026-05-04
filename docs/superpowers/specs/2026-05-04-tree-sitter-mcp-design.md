# Tree-sitter 기반 코드 분석 MCP 서버 설계

## 요약

TypeScript로 MCP 서버를 만들고, Tree-sitter를 사용해 JavaScript, TypeScript, Python 코드를 온디맨드로 분석한다. 서버는 시작 시 지정한 `workspaceRoot` 내부 파일만 읽으며, 1차 범위에서는 전체 워크스페이스 인덱싱이나 파일 변경 감지를 구현하지 않는다.

## 목표

- JavaScript, TypeScript, Python 파일을 Tree-sitter로 파싱한다.
- MCP tool 6개를 제공한다.
  - 함수, 클래스, 메서드 등 주요 심볼 목록 추출
  - 특정 심볼의 정의 위치 찾기
  - 특정 심볼의 참조 위치 찾기
  - 파일 구조 요약
  - Tree-sitter query 실행
  - LLM이 읽기 좋은 코드 구조 컨텍스트 생성
- 모든 파일 접근은 `workspaceRoot` 내부로 제한한다.
- 각 tool은 사람이 읽기 쉬운 텍스트보다 구조화된 JSON 결과를 우선 반환한다.
- 샘플 fixture 기반 테스트로 기본 동작과 보안 경계를 검증한다.

## 비목표

- 전체 코드베이스 상시 인덱싱
- 파일 변경 감지와 자동 재인덱싱
- LSP 수준의 정확한 타입 해석
- import graph, call graph, data flow 분석
- Git, 패키지 매니저, 외부 네트워크 접근
- `workspaceRoot` 밖 파일 분석

## 기술 선택

- 런타임: Node.js
- 언어: TypeScript
- MCP SDK: `@modelcontextprotocol/sdk`
- 파서: `tree-sitter`
- 언어 grammar:
  - JavaScript
  - TypeScript / TSX
  - Python
- 테스트: Vitest

TypeScript를 선택하는 이유는 MCP TypeScript SDK가 공식 SDK이고, MCP tool 입력과 출력 스키마를 TypeScript 타입으로 관리하기 쉽기 때문이다. Tree-sitter도 Node 바인딩과 언어 grammar 패키지를 통해 파일 단위 파싱을 단순하게 구성할 수 있다.

## 서버 실행 모델

서버는 stdio transport 기반 MCP 서버로 실행한다.

서버 시작 시 `workspaceRoot`를 설정한다. 설정 방식은 다음 우선순위를 따른다.

1. CLI 인자 `--workspace-root`
2. 환경 변수 `WORKSPACE_ROOT`
3. 현재 작업 디렉터리

현재 작업 디렉터리는 편의용 기본값일 뿐이며, 모든 분석 대상 경로는 확정된 `workspaceRoot` 내부인지 검증한다.

## 보안 경계

파일 접근은 다음 순서로 처리한다.

1. 입력 경로를 `workspaceRoot` 기준으로 해석한다.
2. 절대 경로로 정규화한다.
3. 가능한 경우 실제 경로를 확인해 심볼릭 링크 우회를 막는다.
4. 정규화된 경로가 `workspaceRoot` 내부가 아니면 거부한다.
5. 지원 확장자가 아니면 거부한다.

허용 확장자는 1차 범위에서 `.js`, `.jsx`, `.ts`, `.tsx`, `.py`로 제한한다.

## 주요 모듈

### MCP 서버 계층

역할:

- MCP 서버 생성
- stdio transport 연결
- tool 등록
- 입력 스키마 검증
- tool 호출을 분석 계층으로 위임

예상 파일:

- `src/server.ts`
- `src/tools.ts`

### 워크스페이스 계층

역할:

- `workspaceRoot` 확정
- 경로 정규화
- 루트 밖 접근 차단
- 파일 읽기
- glob 또는 명시 경로 목록 순회

예상 파일:

- `src/workspace.ts`

### 파싱 계층

역할:

- 확장자 기반 언어 판별
- Tree-sitter parser 생성
- 파일 내용을 AST로 파싱
- 언어별 query 로딩

예상 파일:

- `src/parser.ts`
- `src/languages.ts`

### 분석 계층

역할:

- 심볼 추출
- 정의 검색
- 참조 검색
- 파일 요약
- Tree-sitter query 실행
- LLM 컨텍스트 생성

예상 파일:

- `src/analysis/symbols.ts`
- `src/analysis/definitions.ts`
- `src/analysis/references.ts`
- `src/analysis/summary.ts`
- `src/analysis/query.ts`
- `src/analysis/context.ts`

## MCP Tools

### `list_symbols`

입력:

- `path`: 분석할 파일 경로
- `includeKinds`: 선택 사항. 반환할 심볼 종류 제한

출력:

- 파일 경로
- 언어
- 심볼 배열
  - 이름
  - 종류
  - 시작 위치
  - 끝 위치
  - 선택 사항: 부모 심볼

초기 심볼 종류:

- `function`
- `method`
- `class`
- `variable`
- `interface`
- `type`

언어가 지원하지 않는 심볼 종류는 빈 결과로 둔다.

### `find_definition`

입력:

- `name`: 찾을 심볼 이름
- `paths`: 분석할 파일 경로 목록
- `kinds`: 선택 사항. 정의 종류 제한

출력:

- 일치한 정의 목록
  - 파일 경로
  - 이름
  - 종류
  - 위치
  - 코드 조각

1차 범위에서는 타입 해석이나 import resolution을 하지 않는다. 지정된 파일들 안에서 Tree-sitter query로 정의 후보를 찾는다.

### `find_references`

입력:

- `name`: 찾을 식별자 이름
- `paths`: 분석할 파일 경로 목록

출력:

- 참조 목록
  - 파일 경로
  - 위치
  - 코드 조각
  - 선택 사항: 참조 주변 노드 종류

1차 범위에서는 같은 이름의 식별자 사용처를 찾는다. 스코프 분석은 하지 않으므로, 결과는 후보 목록으로 취급한다.

### `summarize_file`

입력:

- `path`: 분석할 파일 경로

출력:

- 파일 경로
- 언어
- 최상위 구조 요약
- 주요 import 또는 export
- 주요 심볼
- 코드 크기 정보

이 tool은 LLM이 파일을 빠르게 이해하는 데 필요한 구조 정보를 간결하게 반환한다.

### `run_query`

입력:

- `path`: 분석할 파일 경로
- `query`: Tree-sitter query 문자열

출력:

- capture 목록
  - capture 이름
  - 노드 종류
  - 위치
  - 텍스트

query 실행 오류는 MCP tool 오류가 아니라 구조화된 실패 결과로 반환한다. 사용자가 query를 수정할 수 있도록 오류 메시지와 언어 정보를 포함한다.

### `build_context`

입력:

- `paths`: 분석할 파일 경로 목록
- `detail`: `compact` 또는 `full`

출력:

- 파일별 요약
- 주요 심볼 목록
- 정의 후보
- LLM 프롬프트에 넣기 좋은 Markdown 컨텍스트

`compact`는 구조와 심볼 중심으로 반환한다. `full`은 주요 코드 조각을 더 포함하되, 전체 파일 내용을 무조건 복사하지 않는다.

## 데이터 모델

공통 위치 모델:

```ts
type SourcePosition = {
  row: number;
  column: number;
};

type SourceRange = {
  start: SourcePosition;
  end: SourcePosition;
};
```

공통 심볼 모델:

```ts
type CodeSymbol = {
  name: string;
  kind: string;
  range: SourceRange;
  selectionRange?: SourceRange;
  parentName?: string;
};
```

## 오류 처리

예상 가능한 사용자 입력 오류는 구조화된 결과로 반환한다.

- 지원하지 않는 확장자
- 존재하지 않는 파일
- `workspaceRoot` 밖 경로
- Tree-sitter query 문법 오류
- 파서 초기화 실패

프로그래밍 오류나 예기치 못한 런타임 오류는 MCP tool 오류로 처리한다.

## 테스트 전략

테스트 fixture를 언어별로 둔다.

- `fixtures/sample.ts`
- `fixtures/sample.js`
- `fixtures/sample.py`

검증 항목:

- JS/TS/Python 파일 파싱 성공
- `list_symbols`가 fixture의 함수와 클래스를 찾음
- `find_definition`이 지정한 이름의 정의 위치를 찾음
- `find_references`가 지정한 식별자 후보를 찾음
- `summarize_file`이 구조 요약을 반환함
- `run_query`가 capture를 반환하고, 잘못된 query를 실패 결과로 반환함
- `build_context`가 파일별 구조화 컨텍스트를 반환함
- `workspaceRoot` 밖 경로 접근을 거부함

## 구현 순서

1. TypeScript 프로젝트 초기화
2. MCP 서버 기본 실행 구성
3. `workspaceRoot`와 파일 접근 검증 구현
4. Tree-sitter parser와 언어 판별 구현
5. `run_query` 구현
6. `list_symbols` 구현
7. `find_definition`, `find_references` 구현
8. `summarize_file`, `build_context` 구현
9. fixture와 Vitest 테스트 추가
10. README에 실행 방법과 MCP 클라이언트 설정 예시 추가

## 향후 확장

- 파일 변경 감지와 메모리 인덱스
- glob 기반 자동 워크스페이스 스캔
- import/export 관계 분석
- 더 많은 언어 grammar 추가
- Tree-sitter query pack을 외부 파일로 분리
- 결과 캐시와 증분 파싱

