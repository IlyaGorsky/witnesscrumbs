import { Breadcrumb, Interceptor, PushFn } from './types';

export interface HttpInterceptorConfig {
  /** 'same-origin' only logs requests to current host, 'all' logs everything */
  httpFilter: 'same-origin' | 'all';
}

const DEFAULTS: HttpInterceptorConfig = {
  httpFilter: 'same-origin',
};

const SENSITIVE_HEADER_RE = /token|authorization|cookie|secret|key|session/i;
const MAX_RESPONSE_BODY = 1024;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return true;
  }
}

function sanitizeHeaders(
  source: Headers | Record<string, string> | undefined | null
): Record<string, string> | undefined {
  if (!source) return undefined;
  const result: Record<string, string> = {};
  const entries = source instanceof Headers ? source.entries() : Object.entries(source);
  for (const [key, value] of entries) {
    result[key] = SENSITIVE_HEADER_RE.test(key) ? '***' : value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseGraphQL(url: string): { isGraphQL: boolean; operationName?: string } {
  try {
    const parsed = new URL(url, window.location.origin);
    if (!parsed.pathname.endsWith('/graphql')) return { isGraphQL: false };
    const op = parsed.searchParams.get('operationName') || undefined;
    return { isGraphQL: true, operationName: op };
  } catch {
    const opMatch = url.match(/\/graphql\b.*[?&]operationName=(\w+)/);
    if (opMatch) return { isGraphQL: true, operationName: opMatch[1] };
    if (/\/graphql\b/.test(url)) return { isGraphQL: true };
    return { isGraphQL: false };
  }
}

function parseGqlType(body: unknown): 'mutation' | 'query' | undefined {
  try {
    let raw: string | undefined;
    if (typeof body === 'string') {
      raw = body;
    } else if (body && typeof body === 'object' && 'query' in body) {
      raw = String((body as Record<string, unknown>).query);
    }
    if (!raw) return undefined;

    if (raw.startsWith('{')) {
      try {
        raw = JSON.parse(raw).query;
      } catch {
        /* not JSON */
      }
    }
    if (!raw) return undefined;
    const trimmed = raw.trimStart();
    if (trimmed.startsWith('mutation')) return 'mutation';
    if (trimmed.startsWith('query') || trimmed.startsWith('{')) return 'query';
    return undefined;
  } catch {
    return undefined;
  }
}

function tryReadGqlErrors(text: string): unknown[] | undefined {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json?.errors) && json.errors.length > 0) return json.errors;
  } catch {
    /* not JSON */
  }
  return undefined;
}

// ─── Interceptor ─────────────────────────────────────────────────────────────

export class HttpInterceptor implements Interceptor {
  private config: HttpInterceptorConfig;
  private push: PushFn = () => {};

  private originalFetch: typeof window.fetch | null = null;
  private originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
  private originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;

  constructor(config: Partial<HttpInterceptorConfig> = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  start(push: PushFn): void {
    this.push = push;
    this.interceptFetch();
    this.interceptXHR();
  }

  stop(): void {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
      this.originalXHROpen = null;
    }
    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
      this.originalXHRSend = null;
    }
    this.push = () => {};
  }

  // ─── Should Log ────────────────────────────────────────────────────────

  private shouldLog(url: string): boolean {
    if (this.config.httpFilter === 'all') return true;
    return isSameOrigin(url);
  }

  // ─── Push Breadcrumb ───────────────────────────────────────────────────

  private pushHttp(opts: {
    method: string;
    url: string;
    transport: 'fetch' | 'xhr';
    status?: number;
    statusText?: string;
    error?: string;
    reason?: string;
    body?: unknown;
    duration?: number;
    requestHeaders?: Record<string, string> | Headers | null;
    responseHeaders?: Record<string, string> | Headers | null;
    responseBody?: string;
    gqlErrors?: unknown[];
  }): void {
    const {
      method,
      url,
      transport,
      status,
      statusText,
      error,
      reason,
      body,
      duration = 0,
      requestHeaders,
      responseHeaders,
      responseBody,
      gqlErrors,
    } = opts;

    const gql = parseGraphQL(url);
    const hasGqlErrors = gqlErrors && gqlErrors.length > 0;

    const level: Breadcrumb['level'] =
      error || reason || hasGqlErrors
        ? 'error'
        : status === undefined || status === 0
          ? 'error'
          : status >= 500
            ? 'error'
            : status >= 400
              ? 'warning'
              : 'info';

    const extra: Record<string, unknown> = { duration: Math.floor(duration) };
    if (status !== undefined) extra.status = status;
    if (statusText) extra.statusText = statusText;
    if (error) extra.error = error;
    if (reason) extra.reason = reason;

    const reqH = sanitizeHeaders(requestHeaders as Headers | Record<string, string> | undefined);
    const resH = sanitizeHeaders(responseHeaders as Headers | Record<string, string> | undefined);
    if (reqH) extra.requestHeaders = reqH;
    if (resH) extra.responseHeaders = resH;

    if (responseBody) {
      extra.responseBody =
        responseBody.length > MAX_RESPONSE_BODY ? responseBody.slice(0, MAX_RESPONSE_BODY) + '…' : responseBody;
    }

    if (gql.isGraphQL) {
      const gqlType = parseGqlType(body);
      const displayName = gql.operationName || 'unknown';
      const prefix = gqlType === 'mutation' ? 'MUT' : 'QRY';
      if (hasGqlErrors) extra.gqlErrors = gqlErrors;

      this.push({
        type: 'http',
        category: 'graphql',
        message: `${prefix} ${displayName}`,
        level,
        data: { operationName: gql.operationName, ...(gqlType && { gqlType }), ...extra, url },
      });
    } else {
      this.push({
        type: 'http',
        category: transport,
        message: `${method} ${url}`,
        level,
        data: extra,
      });
    }
  }

  // ─── Fetch ─────────────────────────────────────────────────────────────

  private interceptFetch(): void {
    this.originalFetch = window.fetch;
    const self = this;

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const method = init?.method?.toUpperCase() || 'GET';
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = init?.body;
      const start = performance.now();
      const requestHeaders = init?.headers ?? null;

      try {
        const response = await self.originalFetch!.call(window, input, init);

        if (self.shouldLog(url)) {
          const duration = performance.now() - start;
          const isGql = parseGraphQL(url).isGraphQL;
          const isError = response.status >= 400;

          let responseBody: string | undefined;
          let gqlErrors: unknown[] | undefined;

          if (isError || isGql) {
            try {
              const text = await response.clone().text();
              if (isError) responseBody = text;
              if (isGql && text) {
                gqlErrors = tryReadGqlErrors(text);
                if (gqlErrors && !isError) responseBody = text;
              }
            } catch {
              /* body unreadable */
            }
          }

          self.pushHttp({
            method,
            url,
            transport: 'fetch',
            status: response.status,
            statusText: response.statusText,
            body,
            duration,
            requestHeaders: requestHeaders as Record<string, string> | Headers | null,
            responseHeaders: response.headers,
            responseBody,
            gqlErrors,
          });
        }

        return response;
      } catch (err) {
        if (self.shouldLog(url)) {
          const reason = err instanceof DOMException && err.name === 'AbortError' ? 'abort' : 'network-error';
          self.pushHttp({
            method,
            url,
            transport: 'fetch',
            status: 0,
            error: String(err),
            reason,
            body,
            duration: performance.now() - start,
            requestHeaders: requestHeaders as Record<string, string> | Headers | null,
          });
        }
        throw err;
      }
    };
  }

  // ─── XHR ───────────────────────────────────────────────────────────────

  private interceptXHR(): void {
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const self = this;

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
      const meta = this as unknown as Record<string, unknown>;
      meta.__qa_method = method.toUpperCase();
      meta.__qa_url = typeof url === 'string' ? url : url.href;
      meta.__qa_reqHeaders = {};
      return self.originalXHROpen!.apply(this, [method, url, ...rest] as Parameters<
        typeof XMLHttpRequest.prototype.open
      >);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
      const meta = this as unknown as Record<string, unknown>;
      const headers = meta.__qa_reqHeaders as Record<string, string> | undefined;
      if (headers) headers[name] = value;
      return originalSetRequestHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const meta = this as unknown as Record<string, unknown>;
      const start = performance.now();
      meta.__qa_reason = '';
      meta.__qa_body = body;

      this.addEventListener('abort', () => {
        meta.__qa_reason = 'abort';
      });
      this.addEventListener('timeout', () => {
        meta.__qa_reason = 'timeout';
      });
      this.addEventListener('error', () => {
        if (!meta.__qa_reason) meta.__qa_reason = 'network-error';
      });

      this.addEventListener('loadend', () => {
        const url = meta.__qa_url as string;
        const method = meta.__qa_method as string;
        const reason = (meta.__qa_reason as string) || undefined;

        if (self.shouldLog(url)) {
          const duration = performance.now() - start;
          const isError = this.status >= 400;
          const isGql = parseGraphQL(url).isGraphQL;

          let responseHeaders: Record<string, string> | undefined;
          try {
            const raw = this.getAllResponseHeaders();
            if (raw) {
              responseHeaders = {};
              for (const line of raw.trim().split(/\r?\n/)) {
                const idx = line.indexOf(':');
                if (idx > 0) {
                  responseHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
                }
              }
            }
          } catch {
            /* CORS may block */
          }

          let responseBody: string | undefined;
          let gqlErrors: unknown[] | undefined;

          if (isError || isGql) {
            try {
              const text = this.responseType === '' || this.responseType === 'text' ? this.responseText : undefined;
              if (text) {
                if (isError) responseBody = text;
                if (isGql) {
                  gqlErrors = tryReadGqlErrors(text);
                  if (gqlErrors && !isError) responseBody = text;
                }
              }
            } catch {
              /* body unreadable */
            }
          }

          self.pushHttp({
            method,
            url,
            transport: 'xhr',
            status: this.status,
            statusText: this.statusText,
            reason: this.status === 0 ? reason || 'network-error' : undefined,
            body: meta.__qa_body,
            duration,
            requestHeaders: meta.__qa_reqHeaders as Record<string, string>,
            responseHeaders,
            responseBody,
            gqlErrors,
          });
        }
      });

      return self.originalXHRSend!.call(this, body);
    };
  }
}
