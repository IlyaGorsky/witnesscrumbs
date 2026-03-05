export interface Breadcrumb {
  timestamp: number;
  type: 'default' | 'http' | 'navigation' | 'ui.click' | 'ui.input' | 'ui.submit' | 'user' | 'video';
  category: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
  /** Number of duplicate occurrences (1 = single, 2+ = deduplicated) */
  count?: number;

  shouldBatch?: boolean;
  batchKey?: string;
}

export type PushFn = (crumb: Breadcrumb) => void;

export interface Interceptor {
  start(push: PushFn): void;
  stop(): void;
}
