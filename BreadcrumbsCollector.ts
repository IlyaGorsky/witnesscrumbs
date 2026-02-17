import { DomInterceptor } from './DomInterceptor';
import { VisibilityInterceptor } from './VisibilityInterceptor';
import { StorageInterceptor } from './StorageInterceptor';
import { NavigationInterceptor } from './NavigationInterceptor';
import { ConsoleInterceptor } from './ConsoleInterceptor';
import { HttpInterceptor } from './HttpInterceptor';
import { Interceptor, PushFn, Breadcrumb } from './types';


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
      new NavigationInterceptor(),
      new VisibilityInterceptor(),
      new ConsoleInterceptor({
        captureConsole: this.config.captureConsole,
        captureErrors: this.config.captureErrors,
      }),
      new StorageInterceptor(),
      ...(this.config.interceptHttp ? [new HttpInterceptor({ httpFilter: this.config.httpFilter })] : []),
    ];
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  start(): void {
    if (this.active) return;
    this.active = true;

    const pushFn: PushFn = (crumb) => this.push(crumb);

    for (const interceptor of this.interceptors) {
      interceptor.start(pushFn);
    }

    if (this.config.persist) {
      const restored = this.restore();
      this.startPersistence();

      this.push({
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
      category: 'navigation',
      message: window.location.pathname + window.location.search,
      level: 'info',
      data: { to: window.location.href, navType: initialNavType },
    });
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;

    for (const interceptor of this.interceptors) {
      interceptor.stop();
    }

    this.stopRecording();

    if (this.config.persist) {
      this.persistNow();
      this.stopPersistence();
    }
  }

  // ─── Video Recording (called from UI) ───────────────────────────────────

  async startRecording(): Promise<void> {
    if (this.isRecording) return;

    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: VIDEO_CONFIG.WIDTH,
          height: VIDEO_CONFIG.HEIGHT,
          frameRate: VIDEO_CONFIG.FPS,
        },
        audio: false,
        // @ts-expect-error — experimental API
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: VIDEO_CONFIG.BITRATE,
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 1024) {
          this.videoBuffer.push({ blob: e.data, timestamp: Date.now() });
        }
      };

      this.mediaRecorder.start(VIDEO_CONFIG.CHUNK_INTERVAL);
      this.isRecording = true;

      this.push({
        type: 'user',
        category: 'recording',
        message: 'Video recording started',
        level: 'info',
      });
    } catch {
      // User cancelled the screen share dialog
    }
  }

  stopRecording(): void {
    if (!this.isRecording) return;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.isRecording = false;

    this.push({
      type: 'user',
      category: 'recording',
      message: 'Video recording stopped',
      level: 'info',
    });
  }

  private saveBugVideo(msBefore: number, msAfter: number, errorTimestamp: number): void {
    if (this.timerIdSaveVideo) return;

    const errorTime = Date.now();
    const chunksAtError = this.videoBuffer.getAll();
    const beforeChunks = chunksAtError.filter((c) => c.timestamp > errorTime - msBefore && c.timestamp <= errorTime);

    if (beforeChunks.length === 0) return;

    const lastBeforeTimestamp = Math.max(...beforeChunks.map((c) => c.timestamp));

    this.timerIdSaveVideo = setTimeout(() => {
      const chunksAfter = this.videoBuffer.getAll();
      const afterChunks = chunksAfter.filter(
        (c) => c.timestamp > lastBeforeTimestamp && c.timestamp < errorTime + msAfter
      );

      this.saveVideoBlob([...beforeChunks, ...afterChunks], errorTime, msBefore, msAfter, errorTimestamp);
      this.timerIdSaveVideo = null;
    }, msAfter);
  }

  private saveVideoBlob(
    chunks: { blob: Blob; timestamp: number }[],
    errorTime: number,
    msBefore: number,
    msAfter: number,
    errorTimestamp: number
  ): void {
    if (chunks.length === 0) return;

    let sortedChunks = [...chunks].sort((a, b) => a.timestamp - b.timestamp);

    // Keep only continuous segment (no gaps > 2s)
    const hasGap = sortedChunks.some((chunk, i) => i > 0 && chunk.timestamp - sortedChunks[i - 1].timestamp > 2000);

    if (hasGap) {
      const continuous: typeof sortedChunks = [];
      for (const chunk of sortedChunks) {
        if (continuous.length === 0) {
          continuous.push(chunk);
          continue;
        }
        if (chunk.timestamp - continuous[continuous.length - 1].timestamp < 2000) {
          continuous.push(chunk);
        } else {
          break;
        }
      }
      sortedChunks = continuous;
    }

    if (sortedChunks.length === 0 || sortedChunks[0].blob.size < 1024) return;

    const videoBlob = new Blob(
      sortedChunks.map((c) => c.blob),
      { type: 'video/webm;codecs=vp8' }
    );

    if (videoBlob.size < 2048) return;

    const reader = new FileReader();
    reader.readAsDataURL(videoBlob);
    reader.onloadend = () => {
      this.push({
        timestamp: errorTime,
        type: 'video',
        category: 'system',
        message: `Bug video (${msBefore / 1000}s before, ${msAfter / 1000}s after)`,
        level: 'info',
        data: {
          base64: reader.result,
          duration: `${sortedChunks.length}s`,
          size: `${Math.round(videoBlob.size / 1024)}KB`,
          errorTimestamp,
        },
      });
      this.videoBuffer.clear();
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  getLogs(): Breadcrumb[] {
    return this.buffer.getAll();
  }

  clear(): void {
    this.buffer.clear();
    if (this.config.persist) this.persistNow();
    this.notify();
  }

  push(crumb: Omit<Breadcrumb, 'timestamp'> & { timestamp?: number }): void {
    const breadcrumb: Breadcrumb = {
      timestamp: crumb.timestamp ?? Date.now(),
      ...crumb,
    } as Breadcrumb;

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
          if (this.config.persist) this.schedulePersist();
          this.notify();
          return;
        }
      }

      if (this.isRecording) {
        this.saveBugVideo(VIDEO_CONFIG.ERROR_BEFORE, VIDEO_CONFIG.ERROR_AFTER, breadcrumb.timestamp);
      }
    }

    this.buffer.push(breadcrumb);
    if (this.config.persist) this.schedulePersist();
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
      if (!raw) return 0;

      const saved = JSON.parse(raw) as Breadcrumb[];
      if (!Array.isArray(saved)) return 0;

      for (const crumb of saved) {
        this.buffer.push(crumb);
      }
      return saved.length;
    } catch {
      return 0;
    }
  }

  private persistNow(): void {
    try {
      const data = JSON.stringify(this.buffer.getAll());
      sessionStorage.setItem(this.config.storageKey, data);
    } catch {
      // sessionStorage full or unavailable
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
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
