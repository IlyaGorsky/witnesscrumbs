import type { Breadcrumb } from '../core/types';

export function getIcon(b: Breadcrumb): string {
  switch (b.type) {
    case 'ui.click':
      return 'CLICK';
    case 'ui.input':
      return 'INPUT';
    case 'ui.submit':
      return 'SUBMIT';
    case 'navigation':
      return 'NAV';
    case 'http':
      return b.category === 'graphql' ? 'GQL' : b.category === 'xhr' ? 'XHR' : 'FETCH';
    case 'user':
      return 'USR';
    case 'video':
      return 'VID';
    default:
      if (b.category === 'visibility') return 'TAB';
      if (b.category === 'session') return 'SES';
      if (b.category === 'network') return 'NET';
      if (b.category === 'storage') return 'LS';
      return b.category === 'console.error' ? 'ERR' : b.category === 'console.warn' ? 'WARN' : 'LOG';
  }
}

export function formatDetail(b: Breadcrumb): string {
  if (!b.data && !b.count) return '';
  const parts: string[] = [];
  if (b.data?.text) parts.push(`"${b.data.text}"`);
  if (b.data?.value) parts.push(`→ "${b.data.value}"`);
  if (b.data?.reason) parts.push(`(${b.data.reason})`);
  else if (b.data?.status) parts.push(`[${b.data.status}]`);
  if (b.data?.duration) parts.push(`${b.data.duration}ms`);
  if (b.data?.error && !b.data?.reason) parts.push(`(${b.data.error})`);
  if (b.count && b.count > 1) parts.push(`×${b.count}`);
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

export const COLORS = {
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

export const TYPOGRAPHY = {
  family: { primary: "'Inter', sans-serif", mono: "'JetBrains Mono', monospace" },
  size: { xs: '9px', sm: '10px', base: '11px', md: '12px', lg: '13px', xl: '20px' },
  weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  letterSpacing: { tight: '0.03em', normal: '0.05em', wide: '0.08em' },
} as const;

export const SPACING = {
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

export const BORDERS = { width: { none: '0', thin: '1px', thick: '4px' }, style: 'solid' } as const;
