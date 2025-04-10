export interface SchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title?: string;
  description?: string;
  fa_icon?: string;
  default?: any;
  enum?: any[];
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  help_text?: string;
  hidden?: boolean;
}

export interface SchemaDef {
  title?: string;
  description?: string;
  fa_icon?: string;
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

export interface JsonSchema {
  $schema?: string;
  $defs?: Record<string, SchemaDef>;
  allOf?: Array<{ $ref: string }>;
  title?: string;
  description?: string;
}

export interface WebSocketMessage {
  type: 'save_schema' | 'get_schema' | 'finish';
  data?: any;
}

export interface WebSocketResponse {
  status?: 'success' | 'error';
  message?: string;
  type?: string;
  data?: any;
}
