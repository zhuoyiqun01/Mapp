export type HttpMethod = 'GET' | 'POST';

export class HttpError extends Error {
  status: number;
  url: string;
  bodyText?: string;

  constructor(message: string, opts: { status: number; url: string; bodyText?: string }) {
    super(message);
    this.name = 'HttpError';
    this.status = opts.status;
    this.url = opts.url;
    this.bodyText = opts.bodyText;
  }
}

type FetchJsonOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  signal?: AbortSignal;
};

function mergeSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const list = signals.filter(Boolean) as AbortSignal[];
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];

  const ctrl = new AbortController();
  const onAbort = () => {
    try {
      ctrl.abort();
    } catch {
      // ignore
    }
  };

  for (const s of list) {
    if (s.aborted) {
      onAbort();
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return ctrl.signal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(h: string | null): number | null {
  if (!h) return null;
  const s = h.trim();
  if (!s) return null;
  const asSeconds = Number(s);
  if (!Number.isNaN(asSeconds) && Number.isFinite(asSeconds)) return Math.max(0, asSeconds * 1000);

  const dt = Date.parse(s);
  if (Number.isNaN(dt)) return null;
  return Math.max(0, dt - Date.now());
}

function backoffMs(attempt: number, base: number): number {
  const jitter = 0.85 + Math.random() * 0.3; // ~±15%
  return Math.round(base * Math.pow(2, attempt) * jitter);
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 12000,
    retries = 2,
    retryBaseDelayMs = 400,
    signal
  } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
    const combinedSignal = mergeSignals([signal, ctrl.signal]) ?? ctrl.signal;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...headers
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: combinedSignal
      });

      if (!res.ok) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get('Retry-After'));
        const bodyText = await res.text().catch(() => undefined);
        const err = new HttpError(`HTTP ${res.status}`, { status: res.status, url, bodyText });

        const retryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
        if (attempt < retries && retryable) {
          await sleep(retryAfterMs ?? backoffMs(attempt, retryBaseDelayMs));
          continue;
        }
        throw err;
      }

      return (await res.json()) as T;
    } catch (e: any) {
      const aborted = e?.name === 'AbortError' || e?.message === 'timeout';
      const retryableNetwork = aborted || e instanceof TypeError;
      if (attempt < retries && retryableNetwork) {
        await sleep(backoffMs(attempt, retryBaseDelayMs));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  // unreachable
  throw new Error('fetchJson failed');
}

type CacheEntry = { expiresAt: number; value: unknown };
const memCache = new Map<string, CacheEntry>();

export async function cachedFetchJson<T>(
  cacheKey: string,
  url: string,
  opts: FetchJsonOptions & { ttlMs: number }
): Promise<T> {
  const now = Date.now();
  const hit = memCache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.value as T;
  const v = await fetchJson<T>(url, opts);
  memCache.set(cacheKey, { expiresAt: now + opts.ttlMs, value: v });
  return v;
}

