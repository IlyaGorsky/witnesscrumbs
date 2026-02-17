import type { Interceptor, PushFn } from './Interceptor';

export class NavigationInterceptor implements Interceptor {
  private push: PushFn = () => {};
  private navigationApiCleanup: (() => void) | null = null;
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;

  start(push: PushFn): void {
    this.push = push;
    window.addEventListener('popstate', this.handlePopstate);
    window.addEventListener('hashchange', this.handleHashChange);

    if (typeof window !== 'undefined' && 'navigation' in window) {
      this.interceptNavigationAPI();
    } else {
      this.interceptHistoryFallback();
    }
  }

  stop(): void {
    window.removeEventListener('popstate', this.handlePopstate);
    window.removeEventListener('hashchange', this.handleHashChange);

    if (this.navigationApiCleanup) {
      this.navigationApiCleanup();
      this.navigationApiCleanup = null;
    }
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
      this.originalPushState = null;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }
    this.push = () => {};
  }

  // ─── Navigation API (Chrome 102+, Edge 102+) ────────────────────────────

  private interceptNavigationAPI(): void {
    const nav = (window as unknown as { navigation: EventTarget }).navigation;

    const handleNavigate = (e: Event) => {
      const evt = e as unknown as {
        navigationType: 'push' | 'replace' | 'reload' | 'traverse';
        destination: { url: string; sameDocument: boolean };
        hashChange: boolean;
        userInitiated: boolean;
      };

      const destUrl = new URL(evt.destination.url);
      const path = destUrl.pathname + destUrl.search;
      const labels: Record<string, string> = {
        push: 'push',
        replace: 'replace',
        reload: 'reload',
        traverse: 'back/forward',
      };

      this.push({
        type: 'navigation',
        category: 'navigation',
        message: path,
        level: 'info',
        data: {
          to: evt.destination.url,
          navType: labels[evt.navigationType] || evt.navigationType,
          sameDocument: evt.destination.sameDocument,
          ...(evt.hashChange && { hashChange: true }),
          ...(evt.userInitiated && { userInitiated: true }),
        },
      });
    };

    nav.addEventListener('navigate', handleNavigate);
    this.navigationApiCleanup = () => nav.removeEventListener('navigate', handleNavigate);
  }

  // ─── History Fallback (Firefox, Safari) ──────────────────────────────────

  private interceptHistoryFallback(): void {
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;

    history.pushState = (state: unknown, unused: string, url?: string | URL | null) => {
      this.originalPushState!.apply(history, [state, unused, url]);
      this.pushNav(url, 'push');
    };

    history.replaceState = (state: unknown, unused: string, url?: string | URL | null) => {
      this.originalReplaceState!.apply(history, [state, unused, url]);
      this.pushNav(url, 'replace');
    };
  }

  private pushNav(url: string | URL | null | undefined, navType: string): void {
    const resolved = url
      ? new URL(String(url), window.location.origin).pathname + new URL(String(url), window.location.origin).search
      : window.location.pathname + window.location.search;

    this.push({
      type: 'navigation',
      category: 'navigation',
      message: resolved,
      level: 'info',
      data: { to: url ? new URL(String(url), window.location.origin).href : window.location.href, navType },
    });
  }

  // ─── Event Handlers ──────────────────────────────────────────────────────

  private handlePopstate = (): void => {
    this.push({
      type: 'navigation',
      category: 'navigation',
      message: window.location.pathname + window.location.search,
      level: 'info',
      data: { to: window.location.href, navType: 'back/forward' },
    });
  };

  private handleHashChange = (): void => {
    this.push({
      type: 'navigation',
      category: 'navigation',
      message: window.location.hash,
      level: 'info',
      data: { to: window.location.href, navType: 'hash', hashChange: true },
    });
  };
}
