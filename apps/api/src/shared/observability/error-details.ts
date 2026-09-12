const sensitiveKeyPattern =
  /password|secret|token|authorization|cookie|credential|databaseurl|feedback|body/i;
const maxDepth = 3;
const maxCollectionItems = 20;
const maxStringLength = 1000;

function safeValue(value: unknown, depth: number): unknown {
  if (depth > maxDepth) return '[Truncated]';
  if (typeof value === 'string')
    return value.length > maxStringLength
      ? `${value.slice(0, maxStringLength)}...[Truncated]`
      : value;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value))
    return value.slice(0, maxCollectionItems).map((item) => safeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, maxCollectionItems)
        .map(([key, item]) => [
          key,
          sensitiveKeyPattern.test(key) ? '[Redacted]' : safeValue(item, depth + 1),
        ]),
    );
  }
  return String(value);
}

export interface ErrorDetails {
  name: string;
  message: string;
  code?: string;
  details?: unknown;
  stack?: string;
  cause?: ErrorDetails | unknown;
}

export function errorDetails(
  error: unknown,
  includeStack = process.env.NODE_ENV !== 'production',
): ErrorDetails {
  if (error instanceof Error) {
    const details: ErrorDetails = {
      name: error.name,
      message: error.message,
    };
    if ('code' in error && typeof error.code === 'string') details.code = error.code;
    if ('details' in error && error.details !== undefined)
      details.details = safeValue(error.details, 0);
    if ('issues' in error && Array.isArray(error.issues))
      details.details = safeValue({ issues: error.issues }, 0);
    if (includeStack && error.stack) details.stack = error.stack;
    if ('cause' in error && error.cause !== undefined)
      details.cause = errorDetails(error.cause, includeStack);
    return details;
  }
  const value = safeValue(error, 0);
  return {
    name: typeof error,
    message: typeof value === 'string' ? value : 'Unknown thrown value.',
    ...(typeof value === 'string' ? {} : { cause: value }),
  };
}
