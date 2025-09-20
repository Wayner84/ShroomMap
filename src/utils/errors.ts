export function isAbortError(error: unknown): boolean {
  if (error == null) {
    return false;
  }

  const maybeError = error as { name?: unknown };
  if (typeof maybeError.name === 'string' && maybeError.name === 'AbortError') {
    return true;
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  return false;
}
