/**
 * Fetch with abort timeout. Prevents Worker handlers from hanging forever
 * when an upstream is slow or unreachable, which would otherwise trigger
 * "The script will never generate a response" in the runtime.
 */
export async function fetchWithTimeout(
  input: string | Request,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, signal: externalSignal, ...rest } = init;

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(new Error('upstream timeout')), timeoutMs);

  // Chain external signal if caller provided one.
  if (externalSignal) {
    if (externalSignal.aborted) {
      ctrl.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', () => ctrl.abort(externalSignal.reason), { once: true });
    }
  }

  try {
    return await fetch(input, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
