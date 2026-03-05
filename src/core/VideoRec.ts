/* eslint-disable @typescript-eslint/no-non-null-assertion */
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
    if (this.isRecording) {
      return false;
    }

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

      if (!this.stream) {
        return false;
      }

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: this.config.bitrate,
      });

      // Очищаем буфер при старте
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push({
            blob: e.data,
            timestamp: Date.now(),
          });

          if (this.chunks.length > this.maxChunks) {
            this.chunks.shift();
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
   * Остановить запись и дождаться очистки ресурсов
   */
  async stopRecording(): Promise<void> {
    if (!this.isRecording || !this.mediaRecorder) return;

    return new Promise((resolve) => {
      const handleStop = () => {
        this.cleanup();
        this.collector.push({
          timestamp: Date.now(),
          type: 'default',
          category: 'recording',
          message: '⏹️ Запись видео остановлена',
          level: 'info',
          data: { action: 'stop_recording' },
        });
        this.isRecording = false;
        resolve();
      };

      if (this.mediaRecorder!.state !== 'inactive') {
        this.mediaRecorder!.addEventListener('stop', handleStop, { once: true });
        this.mediaRecorder!.stop();
      } else {
        handleStop();
      }
    });
  }

  /**
   * Сохранить всё видео из буфера (для ручного режима)
   */
  async saveVideoForError(errorTimestamp: number): Promise<boolean> {
    if (!this.isRecording || !this.chunks || this.chunks.length === 0) {
      return false;
    }

    const errorTime = Date.now();
    const { secondsBefore, secondsAfter } = this.config;

    // Находим индексы синхронно (это быстро), а процессинг делаем асинхронно
    const errorChunkIndex = this.findChunkIndex(errorTime);
    if (errorChunkIndex === -1) return false;

    const startIndex = Math.max(0, errorChunkIndex - secondsBefore);
    const endIndex = Math.min(this.chunks.length - 1, errorChunkIndex + secondsAfter);

    const chunksToSave = this.chunks.slice(startIndex, endIndex + 1);
    const validChunks = chunksToSave.filter((c) => c.blob && c.blob.size > 0);

    if (validChunks.length === 0) return false;

    // Ждем завершения чтения файла
    await this.processVideoData(validChunks, errorTime, errorTimestamp, secondsBefore, secondsAfter);
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

  /**
   * Внутренний метод, превращающий чтение файла в Promise
   */
  private processVideoData(
    validChunks: { blob: Blob }[],
    eventTime: number,
    errorTimestamp: number,
    before: number,
    after: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const videoBlob = new Blob(
        validChunks.map((c) => c.blob),
        { type: 'video/webm' }
      );

      if (videoBlob.size < 2048) {
        resolve();
        return;
      }

      const reader = new FileReader();

      reader.onloadend = () => {
        this.collector.push({
          timestamp: eventTime,
          type: 'video',
          category: 'system',
          message: `📹 Видео ошибки (${before}с до, ${after}с после)`,
          level: 'error',
          data: {
            base64: reader.result,
            duration: `${validChunks.length}s`,
            size: `${Math.round(videoBlob.size / 1024)}KB`,
            errorTimestamp,
          },
        });
        resolve();
      };

      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(videoBlob);
    });
  }

  async saveFullVideo(): Promise<boolean> {
    if (!this.isRecording || this.chunks.length === 0) return false;

    await this.processVideoData(this.chunks, Date.now(), Date.now(), 0, this.chunks.length);
    return true;
  }

  /**
   * Получить полное видео из буфера как base64 data URL (без записи в крошки).
   * Используется для прикрепления к HTML-отчёту.
   */
  async getFullVideoBase64(): Promise<string | null> {
    if (this.chunks.length === 0) return null;

    const videoBlob = new Blob(
      this.chunks.map((c) => c.blob),
      { type: 'video/webm' }
    );

    if (videoBlob.size < 2048) return null;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(videoBlob);
    });
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
