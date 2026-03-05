/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BreadcrumbsCollectorConfig, BreadcrumbsCollector } from '../core/BreadcrumbsCollector';
import { downloadReportAsHtml } from './WitnesscrumbsReport';
import { VideoRecorder } from '../core/VideoRec';
import { Breadcrumb } from '../core/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QaBreadcrumbsWidgetProps extends Partial<BreadcrumbsCollectorConfig> {
  videoConfig?: {
    bufferSeconds?: number;
    secondsBefore?: number;
    secondsAfter?: number;
  };
}

// ─── Colors & Constants ──────────────────────────────────────────────────────
const cursorStyles = `

  :root.is-clicking .qa-recording-cursor {
    transform: translate3d(calc(var(--mouse-x, -100) * 1px), calc(var(--mouse-y, -100) * 1px), 0) scale(0.8);
    background: rgba(231, 76, 60, 0.5);
  }

  .qa-recording-cursor,
  .qa-recording-label {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  .qa-recording-cursor.is-active,
  .qa-recording-label.is-active {
    opacity: 1;
  }

  .qa-recording-cursor {
    position: fixed;
    width: 40px;
    top: 0;
    left: 0;
    height: 40px;
    border-radius: 50%;
    background: rgba(231, 76, 60, 0.3);
    border: 2px solid #e74c3c;
    box-shadow: 0 0 20px rgba(231, 76, 60, 0.5);
    pointer-events: none;
    z-index: 9999;
    transition: none !important;
    transform: translate3d(calc(var(--mouse-x, -100) * 1px), calc(var(--mouse-y, -100) * 1px), 0);
    backface-visibility: hidden;
    will-change: transform;
  }

  .qa-recording-cursor::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 8px;
    height: 8px;
    background: #e74c3c;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  @keyframes qa-pulse {
    0% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 0.8;
    }
    50% {
      transform: translate(-50%, -50%) scale(1.2);
      opacity: 0.4;
    }
    100% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 0.8;
    }
  }

  .qa-recording-label {
    position: fixed;
    top: 16px;
    right: 70px;
    background: rgba(231, 76, 60, 0.9);
    color: white;
    padding: 4px 12px;
    border-radius: 20px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.05em;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 2147483647;
    pointer-events: none;
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .qa-recording-label::before {
    content: '●';
    color: white;
    margin-right: 6px;
    animation: qa-blink 1s infinite;
  }

  @keyframes qa-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;
const COLORS = {
  bg: { primary: '#0a0a0a', secondary: '#141414', tertiary: '#1a1a1a', accent: '#1e1e1e', highlight: '#2a2a2a' },
  text: { primary: '#ddd', secondary: '#ccc', tertiary: '#888', muted: '#666', dim: '#444' },
  border: { light: '#1e1e1e', medium: '#2a2a2a', dark: '#333' },
  accent: {
    blue: '#82aaff',
    purple: '#9b59b6',
    green: '#4caf50',
    red: '#e74c3c',
    yellow: '#f39c12',
    orange: '#ff9800',
    indigo: '#9575cd',
    gql: '#e040fb',
    cyan: '#29b6f6',
  },
  http: { GET: '#4caf50', POST: '#4285f4', PUT: '#ff9800', PATCH: '#ff9800', DELETE: '#e74c3c' },
  status: { success: '#4caf50', warning: '#f39c12', error: '#e74c3c', info: '#4285f4' },
} as const;

const TYPOGRAPHY = {
  family: { primary: "'Inter', sans-serif", mono: "'JetBrains Mono', monospace" },
  size: { xs: '9px', sm: '10px', base: '11px', md: '12px', lg: '13px', xl: '20px' },
  weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  letterSpacing: { tight: '0.03em', normal: '0.05em', wide: '0.08em' },
} as const;

const SPACING = {
  xs: '2px',
  sm: '4px',
  md: '6px',
  base: '8px',
  lg: '10px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '20px',
  '4xl': '24px',
  '5xl': '32px',
} as const;

const BORDERS = { width: { thin: '1px', thick: '4px' }, style: 'solid' } as const;

const kbdStyle = {
  display: 'inline-block',
  background: COLORS.bg.highlight,
  border: `${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.dark}`,
  borderRadius: 3,
  padding: `1px ${SPACING.xs}`,
  fontFamily: TYPOGRAPHY.family.mono,
  fontSize: TYPOGRAPHY.size.xs,
  fontWeight: TYPOGRAPHY.weight.bold,
  color: COLORS.text.tertiary,
  boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
} as const;

// ─── Helper Functions ────────────────────────────────────────────────────────

function statusColor(status: number): string {
  if (status >= 500) {
    return COLORS.status.error;
  }
  if (status >= 400) {
    return COLORS.status.warning;
  }
  if (status >= 300) {
    return COLORS.accent.cyan;
  }
  if (status >= 200) {
    return COLORS.status.success;
  }
  return COLORS.text.tertiary;
}

function getBadgeText(b: Breadcrumb): string {
  if (b.type === 'navigation') {
    return 'NAV';
  }
  if (b.type === 'ui.click') {
    return 'CLICK';
  }
  if (b.type === 'ui.input') {
    return 'INPUT';
  }
  if (b.type === 'ui.submit') {
    return 'SUBMIT';
  }
  if (b.type === 'video') {
    return '📹';
  }
  if (b.category === 'visibility') {
    return b.message.includes('hidden') ? 'HIDE' : 'SHOW';
  }
  if (b.category === 'recording') {
    return 'VID';
  }
  if (b.category === 'storage') {
    return 'LS';
  }
  if (b.category === 'network') {
    return 'NET';
  }
  if (b.category === 'graphql') {
    return 'GQL';
  }
  if (b.type === 'http') {
    const method = b.message.split(' ')[0];
    return method;
  }
  if (b.level === 'error') {
    return 'ERR';
  }
  if (b.level === 'warning') {
    return 'WARN';
  }
  return 'LOG';
}

function getBadgeColors(b: Breadcrumb): { bg: string; fg: string } {
  // Ошибки и предупреждения
  if (b.level === 'error') {
    return { bg: `${COLORS.status.error}15`, fg: COLORS.status.error };
  }
  if (b.level === 'warning') {
    return { bg: `${COLORS.status.warning}15`, fg: COLORS.status.warning };
  }

  // По типу
  if (b.type === 'navigation') {
    return { bg: `${COLORS.accent.green}15`, fg: COLORS.accent.green };
  }
  if (b.type === 'ui.click') {
    return { bg: `${COLORS.accent.blue}15`, fg: COLORS.accent.blue };
  }
  if (b.type === 'ui.input') {
    return { bg: `${COLORS.accent.indigo}15`, fg: COLORS.accent.indigo };
  }
  if (b.type === 'ui.submit') {
    return { bg: `${COLORS.accent.orange}15`, fg: COLORS.accent.orange };
  }
  if (b.category === 'graphql') {
    return { bg: `${COLORS.accent.gql}15`, fg: COLORS.accent.gql };
  }
  if (b.category === 'storage') {
    return { bg: `${COLORS.accent.indigo}15`, fg: COLORS.accent.indigo };
  }
  if (b.category === 'network') {
    return { bg: `${COLORS.accent.orange}15`, fg: COLORS.accent.orange };
  }
  if (b.category === 'visibility') {
    return { bg: `${COLORS.accent.purple}15`, fg: COLORS.accent.purple };
  }
  if (b.category === 'recording') {
    return { bg: `${COLORS.accent.purple}15`, fg: COLORS.accent.purple };
  }
  if (b.type === 'video') {
    return { bg: `${COLORS.accent.purple}15`, fg: COLORS.accent.purple };
  }

  // HTTP методы
  if (b.type === 'http') {
    const method = b.message.split(' ')[0];
    switch (method) {
      case 'GET':
        return { bg: `${COLORS.http.GET}15`, fg: COLORS.http.GET };
      case 'POST':
        return { bg: `${COLORS.http.POST}15`, fg: COLORS.http.POST };
      case 'PUT':
      case 'PATCH':
        return { bg: `${COLORS.http.PUT}15`, fg: COLORS.http.PUT };
      case 'DELETE':
        return { bg: `${COLORS.http.DELETE}15`, fg: COLORS.http.DELETE };
    }
  }

  return { bg: `${COLORS.text.muted}15`, fg: COLORS.text.muted };
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
}

function truncateError(message: string): { short: string; full: string; isTruncated: boolean } {
  const lines = message.split('\n').filter((l) => l.trim());
  const appFrames = lines.filter((l) => (l.includes('app/') || l.includes('src/')) && !l.includes('node_modules'));

  const shortParts = [lines[0] || message];
  if (appFrames.length > 0 && appFrames[0] !== lines[0]) {
    shortParts.push(`  at ${appFrames[0].trim().replace(/^at\s+/, '')}`);
  }

  return { short: shortParts.join('\n'), full: message, isTruncated: lines.length > 2 };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const formatDuration = (ms) => {
  if (!ms || ms < 0) return '0:00';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedSeconds = seconds.toString().padStart(2, '0');

  // Если запись длится больше часа, добавляем часы в вывод
  if (hours > 0) {
    const paddedMinutes = minutes.toString().padStart(2, '0');
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
};


export const WitnesscrumbsWidget = (props: QaBreadcrumbsWidgetProps): JSX.Element => {
  const breadcumbCollector = useMemo<BreadcrumbsCollector>(() => new BreadcrumbsCollector(props), []);
  const [videoRecorder] = useState(() => new VideoRecorder(breadcumbCollector));
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState<string | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);

  // Таймер для отображения длительности записи
  useEffect(() => {
    if (!isRecording || !recordingStartTime) return;

    let animationFrameId;

    const update = () => {
      const duration = Date.now() - recordingStartTime;
      const formatted = formatDuration(duration);

      // Обновляем стейт, только если секунда реально изменилась
      setRecordingDuration((prev) => (prev !== formatted ? formatted : prev));

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isRecording, recordingStartTime]);

  const [logs, setLogs] = useState<Breadcrumb[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  const entriesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    breadcumbCollector.start();
    return () => breadcumbCollector.stop();
  }, [breadcumbCollector]);

  useEffect(() => {
    const unsubscribe = breadcumbCollector.onChange(() => setLogs(breadcumbCollector.getLogs()));
    setLogs(breadcumbCollector.getLogs());
    return unsubscribe;
  }, [breadcumbCollector]);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 1200);
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await videoRecorder.stopRecording();
      setIsRecording(false);
      setRecordingStartTime(null);
      setRecordingDuration(null);
      showFlash('⏹️ Запись остановлена');
    } else {
      const started = await videoRecorder.startRecording();
      if (started) {
        setIsRecording(true);
        setRecordingStartTime(Date.now());
        showFlash('🎥 Запись начата');
      }
    }
  }, [isRecording, videoRecorder, showFlash]);

  const handleSaveFullVideo = useCallback(async () => {
    if (videoRecorder.isActive) {
      const saved = await videoRecorder.saveFullVideo();
      if (saved) {
        showFlash('📹 Видео сохранено');
      } else {
        showFlash('⚠️ Нет видео для сохранения');
      }
    }
  }, [videoRecorder, showFlash]);

  const handleCopyJSON = useCallback(async () => {
    showFlash('JSON copied!');
    console.log(JSON.stringify({ logs: breadcumbCollector.getLogs() }, null, 2));
  }, [breadcumbCollector, showFlash]);

  const handleClear = useCallback(() => {
    breadcumbCollector.clear();
    showFlash('Cleared');
  }, [breadcumbCollector, showFlash]);

  const handleDownload = useCallback(async () => {
    const currentLogs = breadcumbCollector.getLogs();
    const hasVideoClips = currentLogs.some((b) => b.type === 'video');
    let fullVideo: string | undefined;

    if (!hasVideoClips) {
      fullVideo = (await videoRecorder.getFullVideoBase64()) ?? undefined;
    }

    await downloadReportAsHtml({
      logs: currentLogs,
      fullVideo,
    });
    showFlash('Downloaded!');
  }, [breadcumbCollector, isRecording, videoRecorder, showFlash]);

  const toggleErrorExpand = useCallback((timestamp: number) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(timestamp)) {
        next.delete(timestamp);
      } else {
        next.add(timestamp);
      }
      return next;
    });
  }, []);

  const hasErrors = logs.some((b) => b.level === 'error');
  const hasWarnings = logs.some((b) => b.level === 'warning');
  const actionCount = logs.length;

  const badgeColor = hasErrors ? COLORS.status.error : hasWarnings ? COLORS.status.warning : COLORS.text.tertiary;
  const badgeBorderColor = hasErrors ? COLORS.status.error : hasWarnings ? COLORS.status.warning : COLORS.border.dark;

  const stats = { isRecording: false, bufferSeconds: 0 };

  const highlightSelector = (text: string) => {
    const regex = /\[(data-[\w-]+)="([^"]+)"\]/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <span key={match.index} style={{ color: COLORS.accent.blue }}>
          {match[0]}
        </span>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts.length > 0 ? parts : text;
  };
  useEffect(() => {
    if (panelOpen && entriesRef.current) {
      entriesRef.current.scrollTop = entriesRef.current.scrollHeight;
    }
  }, [logs, panelOpen]);

  useEffect(() => {
    if (!isRecording) return;

    const root = document.documentElement;

    const handleMouseMove = (e: MouseEvent) => {
      root.style.setProperty('--mouse-x', e.clientX.toString());
      root.style.setProperty('--mouse-y', e.clientY.toString());
    };

    const handleMouseDown = () => {
      // Вместо стейта React используем нативный класс
      root.classList.add('is-clicking');
    };

    const handleMouseUp = () => {
      // Удаляем класс при отпускании кнопки
      root.classList.remove('is-clicking');
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);

      // Чистим за собой при размонтировании
      root.classList.remove('is-clicking');
      root.style.removeProperty('--mouse-x');
      root.style.removeProperty('--mouse-y');
    };
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
      // Добавляем стили
      const styleEl = document.createElement('style');
      styleEl.id = 'qa-recording-styles';
      styleEl.innerHTML = cursorStyles;
      document.head.appendChild(styleEl);

      return () => {
        // Удаляем стили при остановке записи
        const existingStyle = document.getElementById('qa-recording-styles');
        if (existingStyle) existingStyle.remove();
      };
    }
  }, [isRecording]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 2147483647,
        fontFamily: TYPOGRAPHY.family.mono,
        maxHeight: '200px',
      }}
    >
      <div className={`qa-recording-cursor ${isRecording ? 'is-active' : ''}`} />
      <div className={`qa-recording-label ${isRecording ? 'is-active' : ''}`}>REC {recordingDuration || '00:00'}</div>
      <div
        style={{
          position: 'absolute',
          bottom: 46,
          right: 0,
          background: COLORS.bg.tertiary,
          border: `${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.dark}`,
          borderRadius: 4,
          padding: `${SPACING.sm} ${SPACING.lg}`,
          color: COLORS.status.success,
          fontSize: TYPOGRAPHY.size.xs,
          fontWeight: TYPOGRAPHY.weight.semibold,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          transition: 'all 0.2s ease',
          opacity: flash ? 1 : 0,
          transform: flash ? 'translateY(0)' : 'translateY(4px)',
        }}
      >
        {flash}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 46,
          right: 0,
          width: 440,
          maxHeight: 520,
          background: COLORS.bg.primary,
          border: `${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.medium}`,
          borderRadius: 8,
          display: panelOpen ? 'flex' : 'none',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${SPACING.lg} ${SPACING['2xl']}`,
            background: COLORS.bg.secondary,
            borderBottom: `${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}`,
          }}
        >
          <span
            style={{
              fontSize: TYPOGRAPHY.size.base,
              fontWeight: TYPOGRAPHY.weight.bold,
              color: COLORS.text.primary,
              letterSpacing: TYPOGRAPHY.letterSpacing.normal,
              textTransform: 'uppercase',
            }}
          >
            Breadcrumbs{' '}
            <span style={{ fontWeight: TYPOGRAPHY.weight.normal, color: COLORS.text.muted }}>
              {actionCount} event{actionCount !== 1 ? 's' : ''}
              {isRecording && stats.bufferSeconds > 0 && (
                <span style={{ marginLeft: SPACING.base, color: COLORS.status.error }}>· 🎥 {recordingDuration}</span>
              )}
            </span>
          </span>

          <div style={{ display: 'flex', gap: SPACING.sm }}>
            <button
              style={{
                background: isRecording ? `${COLORS.status.error}15` : COLORS.bg.highlight,
                border: `${BORDERS.width.thin} ${BORDERS.style} ${isRecording ? COLORS.status.error : COLORS.border.dark}`,
                borderRadius: 4,
                color: isRecording ? COLORS.status.error : COLORS.text.tertiary,
                fontFamily: TYPOGRAPHY.family.mono,
                fontSize: TYPOGRAPHY.size.xs,
                fontWeight: TYPOGRAPHY.weight.semibold,
                padding: `${SPACING.xs} ${SPACING.base}`,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: TYPOGRAPHY.letterSpacing.tight,
                display: 'flex',
                alignItems: 'center',
                gap: SPACING.xs,
              }}
              onClick={toggleRecording}
              title={isRecording ? 'Остановить запись (Alt+Shift+V)' : 'Начать запись видео (Alt+Shift+V)'}
            >
              <span style={{ fontSize: TYPOGRAPHY.size.base }}>{isRecording ? '⏹️' : '🎥'}</span>
              {isRecording ? recordingDuration || 'REC' : 'VIDEO'}
            </button>

            {isRecording && (
              <button
                style={{
                  background: COLORS.bg.highlight,
                  border: `${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.dark}`,
                  borderRadius: 4,
                  color: COLORS.accent.purple,
                  fontFamily: TYPOGRAPHY.family.mono,
                  fontSize: TYPOGRAPHY.size.xs,
                  fontWeight: TYPOGRAPHY.weight.semibold,
                  padding: `${SPACING.xs} ${SPACING.base}`,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: TYPOGRAPHY.letterSpacing.tight,
                }}
                onClick={handleSaveFullVideo}
                title="Сохранить текущий буфер видео"
              >
                💾
              </button>
            )}

            <button
              style={{
                background: COLORS.bg.highlight,
                border: `${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.dark}`,
                borderRadius: 4,
                color: COLORS.text.tertiary,
                fontFamily: TYPOGRAPHY.family.mono,
                fontSize: TYPOGRAPHY.size.xs,
                fontWeight: TYPOGRAPHY.weight.semibold,
                padding: `${SPACING.xs} ${SPACING.base}`,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: TYPOGRAPHY.letterSpacing.tight,
              }}
              onClick={handleCopyJSON}
            >
              JSON
            </button>
            <button
              style={{
                background: COLORS.bg.highlight,
                border: `${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.dark}`,
                borderRadius: 4,
                color: COLORS.accent.blue,
                fontFamily: TYPOGRAPHY.family.mono,
                fontSize: TYPOGRAPHY.size.xs,
                fontWeight: TYPOGRAPHY.weight.semibold,
                padding: `${SPACING.xs} ${SPACING.base}`,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: TYPOGRAPHY.letterSpacing.tight,
              }}
              onClick={handleDownload}
            >
              ↓ HTML
            </button>
            <button
              style={{
                background: COLORS.bg.highlight,
                border: `${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.dark}`,
                borderRadius: 4,
                color: COLORS.status.error,
                fontFamily: TYPOGRAPHY.family.mono,
                fontSize: TYPOGRAPHY.size.xs,
                fontWeight: TYPOGRAPHY.weight.semibold,
                padding: `${SPACING.xs} ${SPACING.base}`,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: TYPOGRAPHY.letterSpacing.tight,
              }}
              onClick={handleClear}
            >
              CLEAR
            </button>
          </div>
        </div>

        <div ref={entriesRef} style={{ flex: 1, overflowY: 'auto', padding: `${SPACING.sm} 0` }}>
          {logs.length === 0 ? (
            <div
              style={{
                padding: `${SPACING['5xl']} ${SPACING['2xl']}`,
                textAlign: 'center',
                color: COLORS.text.dim,
                fontSize: TYPOGRAPHY.size.base,
              }}
            >
              No breadcrumbs yet. Interact with the page.
              <div
                style={{
                  marginTop: SPACING.xl,
                  display: 'flex',
                  justifyContent: 'center',
                  gap: SPACING.xl,
                  fontSize: TYPOGRAPHY.size.xs,
                  color: COLORS.text.muted,
                }}
              >
                <span>
                  <kbd style={kbdStyle}>Alt</kbd>+<kbd style={kbdStyle}>Shift</kbd>+<kbd style={kbdStyle}>V</kbd> video
                </span>
                <span>
                  <kbd style={kbdStyle}>Alt</kbd>+<kbd style={kbdStyle}>Shift</kbd>+<kbd style={kbdStyle}>C</kbd> copy
                </span>
                <span>
                  <kbd style={kbdStyle}>Alt</kbd>+<kbd style={kbdStyle}>Shift</kbd>+<kbd style={kbdStyle}>X</kbd> clear
                </span>
              </div>
            </div>
          ) : (
            logs.map((b, index) => {
              const time = formatTime(b.timestamp);
              const badgeText = getBadgeText(b);
              const badgeColors = getBadgeColors(b);
              const isError = b.level === 'error' || b.level === 'warning';
              const { short, full, isTruncated } = isError
                ? truncateError(b.message)
                : { short: b.message, full: b.message, isTruncated: false };
              const isExpanded = expandedErrors.has(b.timestamp);

              // Для HTTP запросов показываем дополнительную информацию
              const showStatus = b.type === 'http' && b.data?.status;
              const showDuration = b.type === 'http' && b.data?.duration;

              return (
                <div
                  key={index}
                  style={{
                    padding: `${SPACING.xs} ${SPACING['2xl']}`,
                    borderBottom: `${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACING.base }}>
                    <span
                      style={{
                        color: COLORS.text.dim,
                        fontSize: TYPOGRAPHY.size.xs,
                        fontFamily: TYPOGRAPHY.family.mono,
                        minWidth: 58,
                        paddingTop: SPACING.xs,
                      }}
                    >
                      {time}
                    </span>
                    <span
                      style={{
                        minWidth: 42,
                        textAlign: 'center',
                        fontSize: TYPOGRAPHY.size.xs,
                        fontWeight: TYPOGRAPHY.weight.bold,
                        padding: `${SPACING.xs} 0`,
                        borderRadius: 3,
                        background: badgeColors.bg,
                        color: badgeColors.fg,
                        fontFamily: TYPOGRAPHY.family.mono,
                        textTransform: 'uppercase',
                        letterSpacing: TYPOGRAPHY.letterSpacing.tight,
                      }}
                    >
                      {badgeText}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: isError ? badgeColors.fg : COLORS.text.primary,
                          fontFamily: TYPOGRAPHY.family.mono,
                          fontSize: TYPOGRAPHY.size.base,
                          wordBreak: 'break-all',
                          cursor: isTruncated ? 'pointer' : 'default',
                        }}
                        onClick={() => isTruncated && toggleErrorExpand(b.timestamp)}
                      >
                        {highlightSelector(short)}
                        {isTruncated && !isExpanded && (
                          <span style={{ opacity: 0.5, marginLeft: SPACING.sm, fontSize: TYPOGRAPHY.size.xs }}>
                            …expand
                          </span>
                        )}
                      </div>
                      Детали HTTP запроса
                      {(showStatus || showDuration) && (
                        <div
                          style={{
                            marginTop: SPACING.xs,
                            display: 'flex',
                            gap: SPACING.base,
                            fontSize: TYPOGRAPHY.size.xs,
                          }}
                        >
                          {showStatus && (
                            <span style={{ color: statusColor(b.data!.status as number) }}>
                              Статус: {b.data!.status}
                            </span>
                          )}
                          {showDuration && <span style={{ color: COLORS.text.muted }}>{b.data!.duration}ms</span>}
                        </div>
                      )}
                      {b.data?.text && (
                        <div style={{ marginTop: SPACING.xs, fontSize: TYPOGRAPHY.size.xs, color: COLORS.text.muted }}>
                          "{b.data.text}"
                        </div>
                      )}
                      {isExpanded && (
                        <pre
                          style={{
                            marginTop: SPACING.sm,
                            padding: SPACING.md,
                            background: COLORS.bg.primary,
                            border: `${BORDERS.width.thin} ${BORDERS.style} ${badgeColors.fg}33`,
                            borderRadius: 4,
                            color: COLORS.text.tertiary,
                            fontSize: TYPOGRAPHY.size.xs,
                            fontFamily: TYPOGRAPHY.family.mono,
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            maxHeight: 200,
                            overflowY: 'auto',
                          }}
                        >
                          {full}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: COLORS.bg.tertiary,
          border: `${BORDERS.width.thin} ${BORDERS.style} ${badgeBorderColor}`,
          color: badgeColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: TYPOGRAPHY.size.sm,
          fontWeight: TYPOGRAPHY.weight.bold,
          fontFamily: TYPOGRAPHY.family.mono,
          transition: 'all 0.2s ease',
          userSelect: 'none',
        }}
        onClick={() => setPanelOpen((prev) => !prev)}
        title="QA Breadcrumbs (Alt+Shift+L)"
      >
        {actionCount}
      </div>
    </div>
  );
};
