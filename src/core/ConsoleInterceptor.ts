import { Interceptor, PushFn } from './types';

export interface ConsoleInterceptorConfig {
  captureConsole: boolean;
  captureErrors: boolean;
}

const DEFAULTS: ConsoleInterceptorConfig = {
  captureConsole: true,
  captureErrors: true,
};

function safeSerialize(args: unknown[], maxLen = 256): string {
  return args
    .map((arg) => {
      if (arg === null) {
        return 'null';
      }
      if (arg === undefined) {
        return 'undefined';
      }
      if (typeof arg === 'string') {
        return arg;
      }
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}`;
      }
      if (typeof HTMLElement !== 'undefined' && arg instanceof HTMLElement) {
        return `<${arg.tagName.toLowerCase()}>`;
      }
      try {
        const str = JSON.stringify(arg);
        return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

export class ConsoleInterceptor implements Interceptor {
  private config: ConsoleInterceptorConfig;
  private push: PushFn = () => {};
  private originalConsoleError: typeof console.error | null = null;

  constructor(config: Partial<ConsoleInterceptorConfig> = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  start(push: PushFn): void {
    this.push = push;

    if (this.config.captureConsole) {
      this.originalConsoleError = console.error;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;

      console.error = function (...args: unknown[]) {
        // 1. Сначала вызываем оригинал, чтобы не мешать дебагу в DevTools
        if (self.originalConsoleError) {
          self.originalConsoleError.apply(console, args);
        }

        // 2. Синхронно фиксируем время и сериализуем
        // Это важно сделать здесь, так как объекты в args могут измениться позже
        self.push({
          type: 'default',
          category: 'console.error',
          message: safeSerialize(args),
          level: 'error',
          timestamp: Date.now(),
        });
      };
    }

    if (this.config.captureErrors) {
      window.addEventListener('error', this.handleError);
      window.addEventListener('unhandledrejection', this.handleRejection);
    }
  }

  stop(): void {
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
      this.originalConsoleError = null;
    }
    window.removeEventListener('error', this.handleError);
    window.removeEventListener('unhandledrejection', this.handleRejection);
    this.push = () => {};
  }

  private handleError = (e: ErrorEvent): void => {
    this.push({
      type: 'default',
      category: 'console.error',
      message: e.message || 'Unknown error',
      level: 'error',
      timestamp: Date.now(),
      data: { filename: e.filename, lineno: e.lineno },
    });
  };

  private handleRejection = (e: PromiseRejectionEvent): void => {
    this.push({
      type: 'default',
      category: 'promise.rejection',
      message: safeSerialize([e.reason]),
      level: 'error',
      timestamp: Date.now(),
    });
  };
}
