import type { Breadcrumb } from '../types';

/** Format relative timestamp as MM:SS.mmm */
function formatTimestamp(ts: number, t0: number): string {
  const d = ts - t0;
  const m = Math.floor(d / 60000);
  const s = Math.floor((d % 60000) / 1000);
  const ms = d % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Map breadcrumb to a short uppercase tag */
function tag(b: Breadcrumb): string {
  switch (b.type) {
    case 'ui.click': return 'CLICK';
    case 'ui.input': return 'INPUT';
    case 'ui.submit': return 'SUBMIT';
    case 'navigation': return 'NAV';
    case 'http': return b.category === 'graphql' ? 'GQL' : b.data?.method as string || 'HTTP';
    case 'user': return 'USER';
    case 'video': return 'VID';
    default:
      if (b.category === 'console.error') return 'ERR';
      if (b.category === 'console.warn') return 'WARN';
      if (b.category === 'longtask') return 'SLOW';
      if (b.category === 'network') return 'NET';
      if (b.category === 'storage') return 'LS';
      if (b.category === 'visibility') return 'TAB';
      return 'LOG';
  }
}

/** Build detail suffix from breadcrumb data */
function detail(b: Breadcrumb): string {
  const p: string[] = [];
  if (b.type === 'http') {
    const method = b.data?.method || '';
    const url = b.data?.url as string || '';
    const short = url.replace(/^https?:\/\/[^/]+/, '');
    p.push(`${method} ${short}`);
    if (b.data?.status) p.push(`→ ${b.data.status}`);
    if (b.data?.duration) p.push(`${b.data.duration}ms`);
    if (b.data?.gqlErrors) p.push('GQL_ERR');
  } else {
    if (b.data?.text) p.push(`"${b.data.text}"`);
    if (b.data?.value) p.push(`→ "${b.data.value}"`);
    if (b.data?.url) p.push(String(b.data.url));
    if (b.data?.reason) p.push(`(${b.data.reason})`);
    if (b.data?.status) p.push(`[${b.data.status}]`);
    if (b.data?.duration) p.push(`${b.data.duration}ms`);
    if (b.data?.error) p.push(String(b.data.error));
  }
  if (b.count && b.count > 1) p.push(`x${b.count}`);
  return p.length > 0 ? ' ' + p.join(' ') : '';
}

/** Append severity marker */
function levelMark(b: Breadcrumb): string {
  if (b.level === 'error') return ' !!!';
  if (b.level === 'warning') return ' !';
  return '';
}

/**
 * Converts breadcrumbs into a compact text timeline (5-10x shorter than JSON).
 * Format: "MM:SS.mmm TAG message [details]"
 */
export function compactBreadcrumbs(logs: Breadcrumb[]): string {
  if (logs.length === 0) return '(no breadcrumbs)';

  const t0 = logs[0].timestamp;

  return logs.map(b =>
    `${formatTimestamp(b.timestamp, t0)} ${tag(b)} ${b.message}${detail(b)}${levelMark(b)}`
  ).join('\n');
}
