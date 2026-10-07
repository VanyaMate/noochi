export const ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'LIMIT_MESSAGES',
  'LIMIT_EXPLAINS',
  'LIMIT_STUDY_ITEMS',
  'LIMIT_CHARACTERS',
  'FEATURE_NOT_IN_PLAN',
  'AI_KEY_MISSING',
  'AI_UPSTREAM',
  'AI_UNPARSABLE',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'AppError';
  }
}

export class RemoteAppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'RemoteAppError';
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LIMIT_MESSAGES: 402,
  LIMIT_EXPLAINS: 402,
  LIMIT_STUDY_ITEMS: 402,
  LIMIT_CHARACTERS: 402,
  FEATURE_NOT_IN_PLAN: 403,
  AI_KEY_MISSING: 400,
  AI_UPSTREAM: 502,
  RATE_LIMITED: 429,
  AI_UNPARSABLE: 502,
  INTERNAL: 500,
};
