/**
 * Retry utility with exponential backoff for transient errors
 */

/** Errors that are considered transient and should be retried */
const TRANSIENT_ERROR_PATTERNS = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'net::ERR_',
  'Navigation timeout',
  'Timeout exceeded',
  'TimeoutError',
  'socket hang up',
  'read ECONNRESET',
];

/**
 * Check if an error is transient (network/timeout related)
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (message.includes(pattern.toLowerCase()) || name.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Callback for logging retry attempts */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * Execute a function with exponential backoff retry for transient errors
 *
 * @param fn The async function to execute
 * @param options Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries are exhausted, or immediately for non-transient errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Don't retry non-transient errors
      if (!isTransientError(err)) {
        throw err;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        throw err;
      }

      // Calculate delay with exponential backoff: 1s, 2s, 4s
      const delayMs = baseDelayMs * Math.pow(2, attempt);

      if (onRetry) {
        onRetry(attempt + 1, err, delayMs);
      }

      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed');
}

/**
 * Sleep for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
