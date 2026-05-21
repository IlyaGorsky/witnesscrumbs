import { Breadcrumb, Interceptor, PushFn } from './types';

export interface HttpInterceptorConfig {
  /** 'same-origin' only logs requests to current host, 'all' logs everything */
  httpFilter: 'same-origin' | 'all';
}

const DEFAULTS: HttpInterceptorConfig = {
  httpFilter: 'same-origin',
};

const SENSITIVE_RE = /token|authorization|cookie|secret|key|session/i;
const MAX_RESPONSE_BODY = 1024;
const MAX_READ_SIZE = 102400; // 100KB
const getAppOrigin = (): string =>
  typeof window !== 'undefined' ? window.location.origin : '';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSameOrigin(url: string): boolean {
  if (url.startsWith('/') || url.startsWith('./')) return true;
  try {
    return new URL(url, getAppOrigin()).origin === getAppOrigin();
  } catch {
    return true;
  }
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const urlObj = new URL(rawUrl, getAppOrigin());
    let modified = false;
    urlObj.searchParams.forEach((_, key) => {
      if (SENSITIVE_RE.test(key)) {
        urlObj.searchParams.set(key, '***');
        modified = true;
      }
    });
    return modified ? urlObj.toString() : rawUrl;
  } catch {
    return rawUrl;
  }
}

function sanitizeHeaders(source: HeadersInit | undefined | null): Record<string, string> | undefined {
  if (!source) return undefined;
  const result: Record<string, string> = {};
  try {
    const headers = new Headers(source);
    headers.forEach((value, key) => {
      result[key] = SENSITIVE_RE.test(key) ? '***' : value;
    });
  } catch {
    /* Headers init failed */
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseGraphQL(url: string): { isGraphQL: boolean; operationName?: string } {
  try {
    const parsed = new URL(url, getAppOrigin());
    if (!parsed.pathname.endsWith('/graphql')) return { isGraphQL: false };
    const op = parsed.searchParams.get('operationName') || undefined;
    return { isGraphQL: true, operationName: op };
  } catch {
    return { isGraphQL: /\/graphql\b/.test(url) };
  }
}

function parseGqlType(body: unknown): 'mutation' | 'query' | undefined {
  if (!body || body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer) return undefined;
  try {
    let raw: string | undefined;
    if (typeof body === 'string') raw = body;
    else if (typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if ('query' in obj) raw = String(obj.query);
      else raw = JSON.stringify(obj);
    }

    if (!raw) return undefined;
    if (raw.trimStart().startsWith('{')) {
      try {
        raw = JSON.parse(raw).query;
      } catch {
        /* ignore */
      }
    }

    const trimmed = (raw || '').trimStart();
    if (trimmed.startsWith('mutation')) return 'mutation';
    if (trimmed.startsWith('query') || trimmed.startsWith('{')) return 'query';
  } catch {
    /* ignore */
  }
  return undefined;
}

function tryReadGqlErrors(text: string): unknown[] | undefined {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json?.errors) && json.errors.length > 0) return json.errors;
    if (text.includes('errorType') && json.data) return [json.data];
  } catch {
    /* ignore */
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
    if (this.originalFetch) window.fetch = this.originalFetch;
    if (this.originalXHROpen) XMLHttpRequest.prototype.open = this.originalXHROpen;
    if (this.originalXHRSend) XMLHttpRequest.prototype.send = this.originalXHRSend;
    this.push = () => {};
  }

  private shouldLog(url: string): boolean {
    return this.config.httpFilter === 'all' || isSameOrigin(url);
  }

  private pushHttp(opts: any): void {
    const { method, url, transport, status, body, duration, requestHeaders, responseHeaders, responseBody, gqlErrors } =
      opts;
    const gql = parseGraphQL(url);
    const hasGqlErrors = !!gqlErrors?.length;
    const sanitizedUrl = sanitizeUrl(url);

    const level: Breadcrumb['level'] =
      opts.error || opts.reason || hasGqlErrors || !status || status >= 500
        ? 'error'
        : status >= 400
          ? 'warning'
          : 'info';

    const extra: Record<string, any> = {
      duration: Math.floor(duration),
      status,
      requestHeaders: sanitizeHeaders(requestHeaders),
      responseHeaders: sanitizeHeaders(responseHeaders as any),
    };

    if (responseBody) {
      extra.responseBody =
        responseBody.length > MAX_RESPONSE_BODY ? responseBody.slice(0, MAX_RESPONSE_BODY) + '…' : responseBody;
    }

    if (gql.isGraphQL) {
      const gqlType = parseGqlType(body);
      const prefix = gqlType === 'mutation' ? 'MUT' : 'QRY';
      this.push({
        timestamp: Date.now(),
        type: 'http',
        category: 'graphql',
        message: `${prefix} ${gql.operationName || 'unknown'}`,
        level,
        data: { ...extra, url: sanitizedUrl, gqlType, operationName: gql.operationName, gqlErrors },
      });
    } else {
      this.push({
        timestamp: Date.now(),
        type: 'http',
        category: transport,
        message: `${method} ${sanitizedUrl}`,
        level,
        data: { ...extra, url: sanitizedUrl },
      });
    }
  }

  private interceptFetch(): void {
    this.originalFetch = window.fetch;
    const self = this;

    window.fetch = async function (input, init) {
      const start = performance.now();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      try {
        const response = await self.originalFetch!.call(window, input, init);
        if (self.shouldLog(url)) {
          self.processFetchAsync(response.clone(), {
            url,
            method: init?.method || 'GET',
            body: init?.body,
            start,
            headers: init?.headers,
          });
        }
        return response;
      } catch (err) {
        if (self.shouldLog(url)) {
          self.pushHttp({
            method: init?.method || 'GET',
            url,
            transport: 'fetch',
            error: String(err),
            duration: performance.now() - start,
          });
        }
        throw err;
      }
    };
  }

  private async processFetchAsync(res: Response, req: any) {
    let responseBody: string | undefined;
    let gqlErrors: unknown[] | undefined;
    const isGql = parseGraphQL(req.url).isGraphQL;
    const isError = res.status >= 400;

    if (isGql || isError) {
      const contentType = res.headers.get('content-type') || '';
      const size = parseInt(res.headers.get('content-length') || '0', 10);
      if ((contentType.includes('json') || contentType.includes('text')) && (isNaN(size) || size < MAX_READ_SIZE)) {
        try {
          const text = await res.text();
          if (isGql) gqlErrors = tryReadGqlErrors(text);
          if (isError || gqlErrors?.length) responseBody = text;
        } catch {}
      }
    }

    this.pushHttp({
      ...req,
      transport: 'fetch',
      status: res.status,
      responseHeaders: res.headers,
      responseBody,
      gqlErrors,
    });
  }

  private interceptXHR(): void {
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    const self = this;

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
      (this as any).__qa = { method, url: typeof url === 'string' ? url : url.href, headers: {} };
      return self.originalXHROpen!.apply(this, arguments as any);
    };

    const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (n, v) {
      if ((this as any).__qa) (this as any).__qa.headers[n] = v;
      return originalSetHeader.apply(this, arguments as any);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const start = performance.now();
      this.addEventListener('loadend', () => {
        const qa = (this as any).__qa;
        if (!qa || !self.shouldLog(qa.url)) return;

        let responseBody: string | undefined;
        try {
          const canRead = this.responseType === '' || this.responseType === 'text';
          if (canRead && this.responseText.length < MAX_READ_SIZE) {
            responseBody = this.responseText;
          }
        } catch {}

        setTimeout(() => {
          const isGql = parseGraphQL(qa.url).isGraphQL;
          let gqlErrors: unknown[] | undefined;
          if (isGql && responseBody) gqlErrors = tryReadGqlErrors(responseBody);

          self.pushHttp({
            method: qa.method,
            url: qa.url,
            transport: 'xhr',
            status: this.status,
            duration: performance.now() - start,
            requestHeaders: qa.headers,
            body,
            responseBody: this.status >= 400 || gqlErrors?.length ? responseBody : undefined,
            gqlErrors,
          });
        }, 0);
      });
      return self.originalXHRSend!.apply(this, arguments as any);
    };
  }
}
