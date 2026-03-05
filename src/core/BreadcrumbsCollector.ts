import { DomInterceptor } from './DomInterceptor';
import { VisibilityInterceptor } from './VisibilityInterceptor';
import { StorageInterceptor } from './StorageInterceptor';
import { NavigationInterceptor } from './NavigationInterceptor';
import { ConsoleInterceptor } from './ConsoleInterceptor';
import { HttpInterceptor } from './HttpInterceptor';
import { Interceptor, PushFn, Breadcrumb } from './types';
import { PerformanceInterceptor } from './PerformanceInterceptor';

export interface BreadcrumbsCollectorConfig {
  /** data-attribute name to look for (default: "data-qa") */
  attribute: string;
  /** max breadcrumbs in ring buffer (default: 30) */
  bufferSize: number;
  /** debounce ms for input grouping (default: 500) */
  inputDebounce: number;
  /** mask input values for password fields (default: true) */
  maskPasswords: boolean;
  /** intercept fetch/XHR (default: true) */
  interceptHttp: boolean;
  /** filter HTTP requests: 'same-origin' only logs requests to current host, 'all' logs everything (default: 'same-origin') */
  httpFilter: 'same-origin' | 'all';
  /** capture window errors (default: true) */
  captureErrors: boolean;
  /** intercept console.error (default: true) */
  captureConsole: boolean;
  /** persist breadcrumbs to sessionStorage across page reloads (default: true) */
  persist: boolean;
  /** sessionStorage key (default: '__qa_breadcrumbs') */
  storageKey: string;
}

export type BreadcrumbListener = (breadcrumb: Breadcrumb) => void;

// ─── Ring Buffer ─────────────────────────────────────────────────────────────

class RingBuffer<T> {
  private buffer: T[] = [];
  private maxSize: number;

  constructor(size: number) {
    this.maxSize = size;
  }

  push(item: T): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(item);
  }

  getAll(): T[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  get length(): number {
    return this.buffer.length;
  }

  last(): T | undefined {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : undefined;
  }

  updateLast(updater: (item: T) => T): void {
    if (this.buffer.length > 0) {
      this.buffer[this.buffer.length - 1] = updater(this.buffer[this.buffer.length - 1]);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VIDEO_CONFIG = {
  WIDTH: 640,
  HEIGHT: 480,
  FPS: 15,
  BITRATE: 500000,
  CHUNK_INTERVAL: 1000,
  BUFFER_SIZE: 30,
  ERROR_BEFORE: 5000,
  ERROR_AFTER: 2000,
} as const;

// ─── Collector ───────────────────────────────────────────────────────────────

export class BreadcrumbsCollector {
  private config: BreadcrumbsCollectorConfig;
  private buffer: RingBuffer<Breadcrumb>;
  private videoBuffer: RingBuffer<{ blob: Blob; timestamp: number }>;
  private listeners: Set<BreadcrumbListener> = new Set();
  private active = false;
  private interceptors: Interceptor[] = [];

  // Persistence
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private boundBeforeUnload: (() => void) | null = null;

  // Deduplication
  private static readonly DEDUP_WINDOW_MS = 2000;

  // Video recording
  isRecording = false;
  private timerIdSaveVideo: ReturnType<typeof setTimeout> | null = null;
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;

  constructor(config: Partial<BreadcrumbsCollectorConfig> = {}) {
    this.config = {
      attribute: 'data-qa',
      bufferSize: 30,
      inputDebounce: 500,
      maskPasswords: true,
      interceptHttp: true,
      httpFilter: 'same-origin',
      captureErrors: true,
      captureConsole: true,
      persist: true,
      storageKey: '__qa_breadcrumbs',
      ...config,
    };

    this.buffer = new RingBuffer<Breadcrumb>(this.config.bufferSize);
    this.videoBuffer = new RingBuffer<{ blob: Blob; timestamp: number }>(VIDEO_CONFIG.BUFFER_SIZE);

    this.interceptors = [
      new DomInterceptor({
        attribute: this.config.attribute,
        inputDebounce: this.config.inputDebounce,
        maskPasswords: this.config.maskPasswords,
      }),
      new VisibilityInterceptor(),
      new ConsoleInterceptor({
        captureConsole: this.config.captureConsole,
        captureErrors: this.config.captureErrors,
      }),
      new PerformanceInterceptor(),
      new NavigationInterceptor(),
      new StorageInterceptor(),
      ...(this.config.interceptHttp ? [new HttpInterceptor({ httpFilter: this.config.httpFilter })] : []),
    ];
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  start(): void {
    if (this.active) {
      return;
    }
    this.active = true;

    const pushFn: PushFn = (crumb) => this.push(crumb);

    for (const interceptor of this.interceptors) {
      interceptor.start(pushFn);
    }

    if (this.config.persist) {
      const restored = this.restore();
      this.startPersistence();

      this.push({
        timestamp: Date.now(),
        type: 'default',
        category: 'session',
        message: restored > 0 ? `Session restored (${restored} items)` : 'New session',
        level: 'info',
        ...(restored > 0 && { data: { restored } }),
      });
    }

    // Detect initial page load type
    let initialNavType = 'navigate';
    try {
      const perfEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (perfEntries.length > 0) {
        initialNavType = perfEntries[0].type; // 'navigate' | 'reload' | 'back_forward' | 'prerender'
      }
    } catch {
      /* not available */
    }

    this.push({
      type: 'navigation',
      timestamp: Date.now(),
      category: 'navigation',
      message: window.location.pathname + window.location.search,
      level: 'info',
      data: { to: window.location.href, navType: initialNavType },
    });
  }

  stop(): void {
    if (!this.active) {
      return;
    }
    this.active = false;

    for (const interceptor of this.interceptors) {
      interceptor.stop();
    }

    if (this.config.persist) {
      this.persistNow();
      this.stopPersistence();
    }
  }

  getLogs(): Breadcrumb[] {
    return this.buffer.getAll();
  }

  clear(): void {
    this.buffer.clear();
    if (this.config.persist) {
      this.persistNow();
    }
    this.notify();
  }

  push(crumb: Breadcrumb): void {
    queueMicrotask(() => {
      this.processAndStore(crumb);
    });
  }

  _processCrumb(breadcrumb: Breadcrumb): void {
    // ── Dedup: same error/warning first-line within 2s → increment count ──
    if (breadcrumb.level === 'error' || breadcrumb.level === 'warning') {
      const last = this.buffer.last();
      if (last && (last.level === 'error' || last.level === 'warning')) {
        const lastFirstLine = last.message.split('\n')[0];
        const thisFirstLine = breadcrumb.message.split('\n')[0];

        if (
          lastFirstLine === thisFirstLine &&
          breadcrumb.timestamp - last.timestamp < BreadcrumbsCollector.DEDUP_WINDOW_MS
        ) {
          this.buffer.updateLast((prev) => ({
            ...prev,
            count: (prev.count || 1) + 1,
          }));
          if (this.config.persist) {
            this.schedulePersist();
          }
          this.notify();
          return;
        }
      }
    }

    this.buffer.push(breadcrumb);
    if (this.config.persist) {
      this.schedulePersist();
    }
    this.notify();
  }

  subscribe(listener: BreadcrumbListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onChange(listener: () => void): () => void {
    const wrapped: BreadcrumbListener = () => listener();
    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }

  get length(): number {
    return this.buffer.length;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  /**
   * Внутренняя логика обработки и склейки
   */
  private processAndStore(incoming: Breadcrumb): void {
    const last = this.buffer.last();
    if (this.shouldDedup(incoming, last)) {
      this.updateLast(incoming);
    } else {
      this.commit(incoming);
    }
  }

  /**
   * Обновление существующего события (инкремент счетчика)
   */
  private updateLast(incoming: Breadcrumb): void {
    const last = this.buffer.last();
    if (last) {
      last.count = (last.count || 1) + 1;
      last.timestamp = incoming.timestamp; // Обновляем время на последнее

      if (incoming.message) {
        last.message = incoming.message;
      }

      this.notify(); // Уведомляем подписчиков (например, DiagnosticService)
    }
  }

  private commit(incoming: Breadcrumb): void {
    this.buffer.push({ ...incoming, count: 1 });
    this.notify();
  }

  private shouldDedup(incoming: Breadcrumb, last?: Breadcrumb): boolean {
    if (!last || !incoming.shouldBatch) return false;

    console.log('shouldDedup', incoming);

    // const isWithinWindow = incoming.timestamp - last.timestamp < BreadcrumbsCollector.DEDUP_WINDOW_MS;
    // if (!isWithinWindow) return false;

    // Склейка по универсальному ключу (batchKey) и категории
    // Это покроет и ошибки Console, и изменения в Storage
    return incoming.category === last.category && incoming.level === last.level && incoming.batchKey === last.batchKey;
  }

  // ─── Оптимизированная персистентность ───────────────────────────────────

  private persistNow(): void {
    if (!this.config.persist) return;
    try {
      const data = JSON.stringify(this.buffer.getAll());
      sessionStorage.setItem(this.config.storageKey, data);
    } catch (e) {
      // Если квота превышена, очищаем старые логи, чтобы сохранить новые
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        sessionStorage.removeItem(this.config.storageKey);
      }
    }
  }

  private notify(): void {
    const last = this.buffer.getAll().at(-1);
    if (last) {
      this.listeners.forEach((fn) => fn(last));
    } else {
      this.listeners.forEach((fn) =>
        fn({ timestamp: Date.now(), type: 'default', category: 'system', message: 'cleared', level: 'info' })
      );
    }
  }

  // ─── Session Persistence ─────────────────────────────────────────────────

  private restore(): number {
    try {
      const raw = sessionStorage.getItem(this.config.storageKey);
      if (!raw) {
        return 0;
      }

      const saved = JSON.parse(raw) as Breadcrumb[];
      if (!Array.isArray(saved)) {
        return 0;
      }

      for (const crumb of saved) {
        this.buffer.push(crumb);
      }
      return saved.length;
    } catch {
      return 0;
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistNow();
      this.persistTimer = null;
    }, 1000);
  }

  private startPersistence(): void {
    this.boundBeforeUnload = () => this.persistNow();
    window.addEventListener('beforeunload', this.boundBeforeUnload);
  }

  private stopPersistence(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.boundBeforeUnload) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.boundBeforeUnload = null;
    }
  }
}
