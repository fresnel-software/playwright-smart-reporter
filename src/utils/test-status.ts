import type { TestResultData } from '../types';

/** Match the smart report's failed-test count: unexpected failures and timeouts. */
export function isUnexpectedFailure(
  test: Pick<TestResultData, 'status' | 'outcome'>,
): boolean {
  return test.outcome === 'unexpected' &&
    (test.status === 'failed' || test.status === 'timedOut');
}
