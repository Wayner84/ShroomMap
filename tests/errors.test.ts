import { describe, expect, it } from 'vitest';

import { isAbortError } from '../src/utils/errors';

describe('isAbortError', () => {
  it('detects AbortError instances', () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    expect(isAbortError(abortError)).toBe(true);
  });

  it('returns false for non-abort errors', () => {
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError({ name: 'OtherError' })).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });

  it('detects DOMException aborts when available', () => {
    if (typeof DOMException === 'undefined') {
      expect(isAbortError(null)).toBe(false);
      return;
    }
    const domAbort = new DOMException('aborted', 'AbortError');
    expect(isAbortError(domAbort)).toBe(true);
  });
});
