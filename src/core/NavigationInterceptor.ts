/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { Interceptor, PushFn } from './types';

export class NavigationInterceptor implements Interceptor {
  private push: PushFn = () => {};
  private navigationApiCleanup: (() => void) | null = null;
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;

  start(push: PushFn): void {
    this.push = push;

    // Приоритет современному Navigation API (Chrome 102+)
    if (typeof window !== 'undefined' && 'navigation' in (window as any)) {
      this.interceptNavigationAPI();
    } else {
      // Фоллбэк для браузеров без поддержки Navigation API (Safari, Firefox)
      window.addEventListener('popstate', this.handlePopstate);
      window.addEventListener('hashchange', this.handleHashChange);
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

  private interceptNavigationAPI(): void {
    const nav = (window as any).navigation;

    const handleNavigate = (e: any) => {
      const startTime = performance.now();
      const timestamp = Date.now();
      // Нам важен URL назначения
      const destUrl = new URL(e.destination.url);

      const labels: Record<string, string> = {
        push: 'push',
        replace: 'replace',
        reload: 'reload',
        traverse: 'back/forward',
      };
      requestAnimationFrame(() => {
        setTimeout(() => {
          const duration = performance.now() - startTime;
          this.push({
            timestamp,
            type: 'navigation',
            category: 'navigation',
            message: destUrl.pathname + destUrl.search,
            level: 'info',
            data: {
              to: e.destination.url,
              renderTime: duration,
              navType: labels[e.navigationType] || e.navigationType,
              sameDocument: e.destination.sameDocument,
              userInitiated: e.userInitiated,
            },
          });
        });
      });
    };

    nav.addEventListener('navigate', handleNavigate);
    this.navigationApiCleanup = () => nav.removeEventListener('navigate', handleNavigate);
  }

  private interceptHistoryFallback(): void {
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;

    history.pushState = (state: any, unused: string, url?: string | URL | null) => {
      this.originalPushState!.apply(history, [state, unused, url]);
      this.pushNav(url, 'push');
    };

    history.replaceState = (state: any, unused: string, url?: string | URL | null) => {
      this.originalReplaceState!.apply(history, [state, unused, url]);
      this.pushNav(url, 'replace');
    };
  }

  private pushNav(url: string | URL | null | undefined, navType: string): void {
    const timestamp = Date.now();
    try {
      const origin = window.location.origin;
      // Если URL не передан (popstate), берем текущий href
      const urlObj = url ? new URL(String(url), origin) : new URL(window.location.href);

      this.push({
        timestamp,
        type: 'navigation',
        category: 'navigation',
        message: urlObj.pathname + urlObj.search,
        level: 'info',
        data: { to: urlObj.href, navType },
      });
    } catch (e) {
      // Тихий фоллбэк при ошибках парсинга URL
    }
  }

  private handlePopstate = (): void => this.pushNav(undefined, 'back/forward');
  private handleHashChange = (): void => this.pushNav(undefined, 'hash');
}
