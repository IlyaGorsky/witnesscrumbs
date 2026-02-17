import { BreadcrumbsCollector } from './BreadcrumbsCollector';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoRecorderConfig {
  /** Ширина видео (по умолчанию 1280) */
  width?: number;
  /** Высота видео (по умолчанию 720) */
  height?: number;
  /** FPS (по умолчанию 15) */
  fps?: number;
  /** Битрейт (по умолчанию 2.5 Мбит/с) */
  bitrate?: number;
  /** Сколько секунд держать в буфере (по умолчанию 60) */
  bufferSeconds?: number;
  /** Сколько секунд до ошибки сохранять (по умолчанию 5) */
  secondsBefore?: number;
  /** Сколько секунд после ошибки сохранять (по умолчанию 5) */
  secondsAfter?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  width: 1280,
  height: 720,
  fps: 15,
  bitrate: 2_500_000,
  bufferSeconds: 60,
  secondsBefore: 5,
  secondsAfter: 5,
} as const;

// ─── VideoRecorder Class ─────────────────────────────────────────────────────

export class VideoRecorder {
  private collector: BreadcrumbsCollector;
  private config: Required<VideoRecorderConfig>;

  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private isRecording = false;

  // Кольцевой буфер: храним чанки с таймстемпами
  private chunks: Array<{ blob: Blob; timestamp: number }> = [];
  private maxChunks: number;

  constructor(collector: BreadcrumbsCollector, config?: VideoRecorderConfig) {
    this.collector = collector;
    this.config = {
      width: config?.width ?? DEFAULT_CONFIG.width,
      height: config?.height ?? DEFAULT_CONFIG.height,
      fps: config?.fps ?? DEFAULT_CONFIG.fps,
      bitrate: config?.bitrate ?? DEFAULT_CONFIG.bitrate,
      bufferSeconds: config?.bufferSeconds ?? DEFAULT_CONFIG.bufferSeconds,
      secondsBefore: config?.secondsBefore ?? DEFAULT_CONFIG.secondsBefore,
      secondsAfter: config?.secondsAfter ?? DEFAULT_CONFIG.secondsAfter,
    };

    // При чанках по 1 секунде, maxChunks = bufferSeconds
    this.maxChunks = this.config.bufferSeconds;
  }

  /**
   * Начать запись экрана
   */
  async startRecording(): Promise<boolean> {
    if (this.isRecording) return false;

    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: this.config.width,
          height: this.config.height,
          frameRate: this.config.fps,
        },
        audio: false,
        // @ts-expect-error — experimental API
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      });

      if (!this.stream) return false;

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: this.config.bitrate,
      });

      // Очищаем буфер при старте
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          // Добавляем чанк с таймстемпом
          this.chunks.push({
            blob: e.data,
            timestamp: Date.now(),
          });

          // Ограничиваем размер буфера (кольцевой буфер)
          if (this.chunks.length > this.maxChunks) {
            this.chunks = this.chunks.slice(-this.maxChunks);
          }
        }
      };

      this.mediaRecorder.onstop = () => {
        this.cleanup();
      };

      // Записываем чанками по 1 секунде
      this.mediaRecorder.start(1000);
      this.isRecording = true;

      this.collector.push({
        type: 'default',
        category: 'recording',
        message: '🎥 Запись видео начата',
        level: 'info',
        data: { action: 'start_recording' },
      });

      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') {
        return false;
      }
      console.error('Failed to start recording:', error);
      return false;
    }
  }

  /**
   * Остановить запись
   */
  stopRecording(): void {
    if (!this.isRecording || !this.mediaRecorder) return;

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.collector.push({
      type: 'default',
      category: 'recording',
      message: '⏹️ Запись видео остановлена',
      level: 'info',
      data: { action: 'stop_recording' },
    });

    this.isRecording = false;
  }

  /**
   * Сохранить видео для ошибки (вырезает N секунд до и после)
   */
  saveVideoForError(errorTimestamp: number): boolean {
    // Защита от undefined
    if (!this.chunks) {
      console.error('VideoRecorder: chunks is undefined!');
      return false;
    }

    if (!this.isRecording || this.chunks.length === 0) {
      return false;
    }

    const errorTime = Date.now();

    // Находим индекс чанка, ближайшего к ошибке
    const errorChunkIndex = this.findChunkIndex(errorTime);
    if (errorChunkIndex === -1) return false;

    const beforeSeconds = this.config.secondsBefore;
    const afterSeconds = this.config.secondsAfter;

    // Индексы для обрезки
    const startIndex = Math.max(0, errorChunkIndex - beforeSeconds);
    const endIndex = Math.min(this.chunks.length - 1, errorChunkIndex + afterSeconds);

    const chunksToSave = this.chunks.slice(startIndex, endIndex + 1);
    if (chunksToSave.length === 0) return false;

    // Добавим проверку на пустые blob'ы
    const validChunks = chunksToSave.filter((c) => c.blob && c.blob.size > 0);
    if (validChunks.length === 0) return false;

    const videoBlob = new Blob(
      validChunks.map((c) => c.blob),
      { type: 'video/webm' } // Убрал codecs=vp8 для совместимости
    );

    if (videoBlob.size < 2048) return false;

    const reader = new FileReader();
    reader.readAsDataURL(videoBlob);
    reader.onloadend = () => {
      this.collector.push({
        timestamp: errorTime,
        type: 'video',
        category: 'system',
        message: `📹 Видео ошибки (${beforeSeconds}с до, ${afterSeconds}с после)`,
        level: 'error',
        data: {
          base64: reader.result,
          duration: `${validChunks.length}s`,
          size: `${Math.round(videoBlob.size / 1024)}KB`,
          errorTimestamp,
        },
      });
    };

    return true;
  }
  /**
   * Сохранить всё видео из буфера (для ручного режима)
   */
  saveFullVideo(): boolean {
    if (!this.isRecording || this.chunks.length === 0) return false;

    const videoBlob = new Blob(
      this.chunks.map((c) => c.blob),
      { type: 'video/webm;codecs=vp8' }
    );

    const reader = new FileReader();
    reader.readAsDataURL(videoBlob);
    reader.onloadend = () => {
      this.collector.push({
        timestamp: Date.now(),
        type: 'video',
        category: 'system',
        message: `📹 Срез видео (${this.chunks.length}с)`,
        level: 'info',
        data: {
          base64: reader.result,
          duration: `${this.chunks.length}s`,
          size: `${Math.round(videoBlob.size / 1024)}KB`,
          full: true,
        },
      });
    };

    return true;
  }

  /**
   * Проверить, идёт ли запись
   */
  get isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Получить статистику
   */
  getStats(): { isRecording: boolean; bufferSeconds: number } {
    return {
      isRecording: this.isRecording,
      bufferSeconds: this.chunks.length,
    };
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  private findChunkIndex(errorTime: number): number {
    // Ищем чанк с таймстемпом, ближайшим к errorTime
    // Но не позже errorTime (до ошибки)
    let bestIndex = -1;
    let bestDiff = Infinity;

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      if (chunk.timestamp <= errorTime) {
        const diff = errorTime - chunk.timestamp;
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIndex = i;
        }
      }
    }

    return bestIndex;
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    // Не очищаем буфер — может пригодиться для последующих ошибок
  }
}
