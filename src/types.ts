export type SupportedLanguage = 'javascript' | 'typescript' | 'tsx' | 'python' | 'rust';

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
  | 'PARSE_ERROR'
  | 'INDEX_ERROR';

export type ToolFailure = {
  ok: false;
  error: {
    code: ToolErrorCode;
    message: string;
  };
};
