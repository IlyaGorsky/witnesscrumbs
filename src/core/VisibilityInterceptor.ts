import { Interceptor, PushFn } from "./types";

export class VisibilityInterceptor implements Interceptor {
  private push: PushFn = () => {};
  private hiddenAt = 0;

  start(push: PushFn): void {
    this.push = push;
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  stop(): void {
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.push = () => {};
  }

  private handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      this.push({ type: 'default', category: 'visibility', message: 'Tab hidden', level: 'info' });
    } else {
      const awayMs = this.hiddenAt ? Date.now() - this.hiddenAt : 0;
      this.hiddenAt = 0;
      const awayLabel =
        awayMs >= 60000
          ? `${Math.round(awayMs / 60000)}m`
          : awayMs >= 1000
            ? `${Math.round(awayMs / 1000)}s`
            : `${awayMs}ms`;
      this.push({
        type: 'default',
        category: 'visibility',
        message: `Tab visible (away ${awayLabel})`,
        level: 'info',
        data: { awayMs },
      });
    }
  };

  private handleOnline = (): void => {
    this.push({ type: 'default', category: 'network', message: 'Online', level: 'info' });
  };

  private handleOffline = (): void => {
    this.push({ type: 'default', category: 'network', message: 'Offline', level: 'warning' });
  };
}
