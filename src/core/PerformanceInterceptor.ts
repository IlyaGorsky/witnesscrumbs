import { Interceptor, PushFn } from './types';

export class PerformanceInterceptor implements Interceptor {
  private push: PushFn = () => {};
  private observer: PerformanceObserver | null = null;

  start(push: PushFn): void {
    this.push = push;

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Логируем только то, что реально ощущается как "тормоз" (> 100ms)
          // 50ms - это стандарт, но в SPA это норма. 100ms - это уже фриз.
          if (entry.duration > 100) {
            this.push({
              timestamp: Date.now(),
              type: 'default',
              category: 'perf',
              level: 'warning',
              message: `Long Task: ${Math.round(entry.duration)}ms`,
              shouldBatch: true,
              batchKey: 'perf:longtask',
              data: {
                duration: entry.duration,
                attribution: (entry as any).attribution, // Может показать, какой скрипт виноват
              },
            });
          }
        }
      });

      this.observer.observe({ entryTypes: ['longtask'] });

      // Наблюдаем только за тем, что реально блокирует приложение
      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      /* PerformanceObserver not supported */
    }
  }

  stop(): void {
    if (this.observer) this.observer.disconnect();
    this.push = () => {};
  }
}
