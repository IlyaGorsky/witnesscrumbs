import React from 'react';

import { BORDERS, COLORS, formatDetail, getIcon, SPACING, TYPOGRAPHY } from './dispay';
import { Breadcrumb } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReportProps {
  logs: Breadcrumb[];
  url?: string;
  ua?: string;
  viewport?: string;
  dpr?: string;
  lang?: string;
  theme?: string;
  online?: string;
  timestamp?: string;
  filename?: string;
}

interface AnchorGroup {
  anchor: Breadcrumb;
  children: Breadcrumb[];
}

interface PageGroup {
  url: string;
  navType?: string;
  enteredAt: number;
  leftAt?: number;
  duration?: number;
  anchors: AnchorGroup[];
}

interface WaterfallRequest {
  name: string;
  duration: number;
  status: number;
  timestamp: number;
  level: string;
}

interface ErrorGroup {
  count: number;
  level: string;
  message: string;
  short: string;
  full: string;
  hasStack: boolean;
  timestamp: number;
  page?: PageGroup;
  videos: Breadcrumb[];
  responseBody?: string;
  gqlErrors?: unknown[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NAV_TYPE_COLORS: Record<string, string> = {
  push: COLORS.accent.blue,
  replace: COLORS.accent.indigo,
  'back/forward': COLORS.accent.orange,
  back_forward: COLORS.accent.orange,
  reload: COLORS.accent.yellow,
  navigate: COLORS.accent.green,
  hash: COLORS.accent.cyan,
  prerender: COLORS.text.muted,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isAnchor = (b: Breadcrumb): boolean =>
  ['ui.click', 'ui.input', 'ui.submit', 'navigation'].includes(b.type) || b.category === 'visibility';

const groupByPageAndAnchor = (logs: Breadcrumb[]): PageGroup[] => {
  const pages: PageGroup[] = [];
  let currentPage: PageGroup | null = null;
  let currentAnchor: AnchorGroup | null = null;

  for (const log of logs) {
    if (log.type === 'navigation') {
      if (currentPage) {
        currentPage.leftAt = log.timestamp;
        if (currentPage.enteredAt) {
          currentPage.duration = log.timestamp - currentPage.enteredAt;
        }
      }
      currentPage = {
        url: (log.data?.to as string) || log.message,
        navType: log.data?.navType as string | undefined,
        enteredAt: log.timestamp,
        anchors: [],
      };
      pages.push(currentPage);
      currentAnchor = { anchor: log, children: [] };
      currentPage.anchors.push(currentAnchor);
    } else if (isAnchor(log) && currentPage) {
      currentAnchor = { anchor: log, children: [] };
      currentPage.anchors.push(currentAnchor);
    } else if (currentAnchor) {
      currentAnchor.children.push(log);
    } else {
      if (!currentPage) {
        currentPage = { url: 'initial-state', enteredAt: log.timestamp, anchors: [] };
        pages.push(currentPage);
      }
      if (isAnchor(log)) {
        currentAnchor = { anchor: log, children: [] };
        currentPage.anchors.push(currentAnchor);
      } else {
        currentAnchor = {
          anchor: {
            type: 'default',
            category: 'system',
            message: 'Session events',
            timestamp: log.timestamp,
            level: 'info',
          } as Breadcrumb,
          children: [log],
        };
        currentPage.anchors.push(currentAnchor);
      }
    }
  }
  if (currentPage && !currentPage.leftAt) {
    currentPage.leftAt = Date.now();
  }
  return pages;
};

const truncateError = (message: string): { short: string; full: string; hasStack: boolean } => {
  const lines = message.split('\n').filter((l) => l.trim());
  const appFrames = lines.filter((l) => (l.includes('app/') || l.includes('src/')) && !l.includes('node_modules'));
  const shortParts = [lines[0] || message];
  if (appFrames.length && appFrames[0] !== lines[0]) {
    shortParts.push(`  at ${appFrames[0].trim().replace(/^at\s+/, '')}`);
  }
  return { short: shortParts.join('\n'), full: message, hasStack: lines.length > 2 };
};

const statusColor = (s: number): string =>
  s >= 500
    ? COLORS.status.error
    : s >= 400
      ? COLORS.status.warning
      : s >= 300
        ? COLORS.accent.cyan
        : s >= 200
          ? COLORS.status.success
          : COLORS.text.muted;

const formatTime = (ts: number): string => new Date(ts).toLocaleTimeString('en-US', { hour12: false });
const formatDuration = (ms?: number): string => {
  if (!ms) {
    return '';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3600000) {
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
};

const getPageStatusClass = (page: PageGroup): string => {
  const hasErrors = page.anchors.some((a) => a.children.some((c) => c.level === 'error'));
  const hasWarnings = page.anchors.some((a) => a.children.some((c) => c.level === 'warning'));
  if (hasErrors) {
    return 'has-errors';
  }
  if (hasWarnings) {
    return 'has-warnings';
  }
  return page.anchors.length ? 'has-success' : '';
};

const getPageName = (url: string): string => {
  const segments = url.split('/').filter(Boolean);
  const last = segments[segments.length - 1]?.split('?')[0];
  return last && /^\d+$/.test(last) ? segments[segments.length - 2] || 'page' : last || 'page';
};

const sanitizeHeadersForDisplay = (headers?: Record<string, unknown>): Record<string, string> | null => {
  if (!headers || typeof headers !== 'object') {
    return null;
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    result[k] = String(v);
  }
  return Object.keys(result).length > 0 ? result : null;
};

// ─── Navigation Flow ─────────────────────────────────────────────────────────

const NavigationFlow = ({ pages }: { pages: PageGroup[] }) => {
  if (pages.length < 2) {
    return null;
  }

  return (
    <div className="nav-flow">
      <span className="nav-flow-title">NAVIGATION FLOW</span>
      <div className="nav-flow-steps">
        {pages.map((page, i) => {
          const hasErrors = page.anchors.some((a) => a.children.some((c) => c.level === 'error'));
          const pageName = getPageName(page.url);
          const navColor = page.navType ? NAV_TYPE_COLORS[page.navType] : undefined;

          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <span className="nav-flow-arrow">
                  {page.navType === 'back/forward' || page.navType === 'back_forward' ? '←' : '→'}
                </span>
              )}
              <a
                href={`#page-${i}`}
                className={`nav-flow-step ${hasErrors ? 'has-errors' : ''}`}
                title={`${page.url}${page.navType ? ` (${page.navType})` : ''}`}
              >
                {page.navType && (
                  <span className="nav-type-dot" style={{ background: navColor || COLORS.text.muted }} />
                )}
                {pageName}
              </a>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ─── Universal Components ────────────────────────────────────────────────────

const Stat = ({ value, label, color }: { value: number; label: string; color: string }) => (
  <div className="stat">
    <div className="stat-value" style={{ color }}>
      {value}
    </div>
    <div className="stat-label">{label}</div>
  </div>
);

const EnvItem = ({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) => (
  <div className="env-item" style={fullWidth ? { gridColumn: '1 / -1' } : undefined}>
    <span className="env-label">{label}</span>
    <span className="env-value">{value}</span>
  </div>
);

const Badge = ({ text, color, bg, count }: { text: string; color: string; bg?: string; count?: number }) => (
  <span className="badge" style={{ color, borderColor: `${color}33`, background: bg || `${color}08` }}>
    {text}
    {count ? ` ×${count}` : ''}
  </span>
);

const NavTypeBadge = ({ navType }: { navType?: string }) => {
  if (!navType) {
    return null;
  }
  const color = NAV_TYPE_COLORS[navType] || COLORS.text.muted;
  return <Badge text={navType} color={color} />;
};

// ─── Headers Component ───────────────────────────────────────────────────────

const HeadersDetail = ({ label, headers }: { label: string; headers: Record<string, string> }) => (
  <details className="headers-detail">
    <summary className="headers-summary">{label}</summary>
    <div className="headers-grid">
      {Object.entries(headers).map(([k, v]) => (
        <div key={k} className="header-row">
          <span className="header-key">{k}</span>
          <span className={`header-value ${v === '***' ? 'masked' : ''}`}>{v}</span>
        </div>
      ))}
    </div>
  </details>
);

// ─── Waterfall Component ─────────────────────────────────────────────────────

const Waterfall = ({
  requests,
  startTime,
  compact = false,
}: {
  requests: WaterfallRequest[];
  startTime: number;
  compact?: boolean;
}) => {
  if (!requests.length) {
    return null;
  }
  const maxDuration = Math.max(...requests.map((r) => r.duration));
  const slowCount = requests.filter((r) => r.duration > 2000).length;

  return (
    <details className={`waterfall ${compact ? 'compact' : ''}`}>
      <summary className="waterfall-summary">
        <span className="waterfall-title">WATERFALL</span>
        <span className="waterfall-stats">
          {requests.length} req · {slowCount} slow
        </span>
      </summary>
      <div className="waterfall-scale" style={{ paddingLeft: compact ? 120 : 180 }}>
        <span>0ms</span>
        <span>{(maxDuration / (compact ? 2 : 4)).toFixed(0)}ms</span>
        {!compact && <span>{(maxDuration / 2).toFixed(0)}ms</span>}
        {!compact && <span>{((maxDuration * 3) / 4).toFixed(0)}ms</span>}
        <span>{maxDuration.toFixed(0)}ms</span>
      </div>
      <div className="waterfall-requests">
        {requests.map((req, i) => {
          const left = ((req.timestamp - startTime) / 1000).toFixed(1);
          const width = (req.duration / maxDuration) * 100;
          const barColor =
            req.level === 'error'
              ? COLORS.status.error
              : req.status >= 400
                ? COLORS.status.warning
                : req.duration > 2000
                  ? COLORS.status.warning
                  : COLORS.status.success;
          return (
            <div key={i} className="waterfall-row">
              <span className="waterfall-time" style={{ width: compact ? 35 : 40 }}>
                +{left}s
              </span>
              <span className="waterfall-name" style={{ width: compact ? 120 : 140 }} title={req.name}>
                {req.name}
              </span>
              <div className="waterfall-bar-container">
                <div className="waterfall-bar" style={{ width: `${width}%`, backgroundColor: barColor }} />
              </div>
              <span className="waterfall-duration" style={{ width: compact ? 45 : 70 }}>
                {req.duration}ms
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
};

// ─── HTTP Table ──────────────────────────────────────────────────────────────

const HttpTable = ({ items }: { items: Breadcrumb[] }) => {
  const allOk = items.every((b) => b.level === 'info');
  const hasErrors = items.some((b) => b.level === 'error');
  const isGql = items.some((b) => b.category === 'graphql');
  const isSlow = (duration?: number): boolean => !!(duration && duration > 2000);
  const slowCount = items.filter((b) => isSlow(b.data?.duration as number)).length;

  const summaryColor = !allOk
    ? hasErrors
      ? COLORS.status.error
      : COLORS.status.warning
    : isGql
      ? COLORS.accent.gql
      : COLORS.text.muted;

  let label: string;
  if (isGql) {
    let mutations = 0;
    let queries = 0;
    const ops: Record<string, number> = {};
    for (const b of items) {
      const prefix = b.message.split(' ')[0];
      if (prefix === 'MUT') {
        mutations++;
      } else {
        queries++;
      }
      const name = b.message.split(' ').slice(1).join(' ') || (b.data?.operationName as string) || 'query';
      ops[name] = (ops[name] || 0) + 1;
    }
    const opsSummary = Object.entries(ops)
      .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
      .join(', ');
    const typeParts: string[] = [];
    if (queries > 0) {
      typeParts.push(`${queries} qry`);
    }
    if (mutations > 0) {
      typeParts.push(`${mutations} mut`);
    }
    label = `GQL ${typeParts.join(', ')} — ${opsSummary}`;
  } else {
    label = `${items.length} req${items.length !== 1 ? 's' : ''}${allOk ? ' · ok' : ''}`;
  }
  if (slowCount) {
    label += ` · ${slowCount} slow`;
  }

  return (
    <details className="http-group">
      <summary style={{ color: summaryColor }}>{label}</summary>
      <table className="http-table">
        <tbody>
          {items.map((b, i) => {
            const parts = b.message.split(' ');
            const method = parts[0];
            const rest = parts.slice(1).join(' ');
            const status = b.data?.status as number;
            const reason = b.data?.reason as string;
            const duration = b.data?.duration as number;
            const slow = isSlow(duration);
            const reqHeaders = sanitizeHeadersForDisplay(b.data?.requestHeaders as Record<string, unknown>);
            const resHeaders = sanitizeHeadersForDisplay(b.data?.responseHeaders as Record<string, unknown>);
            const responseBody = b.data?.responseBody as string | undefined;
            const gqlErrors = b.data?.gqlErrors as unknown[] | undefined;

            const isGqlRow = b.category === 'graphql';
            const opName = isGqlRow
              ? rest || (b.data?.operationName as string) || 'query'
              : rest.replace(/https?:\/\/[^/]+/, '');
            const badgeColor = isGqlRow
              ? method === 'MUT'
                ? COLORS.accent.orange
                : COLORS.accent.gql
              : COLORS.http[method as keyof typeof COLORS.http] || COLORS.text.muted;

            return (
              <React.Fragment key={i}>
                <tr>
                  <td>
                    <Badge text={method} color={badgeColor} />
                  </td>
                  <td
                    className="url-cell"
                    style={{ color: b.level === 'error' ? COLORS.status.error : COLORS.text.tertiary }}
                  >
                    {opName}
                  </td>
                  <td
                    style={{
                      color: reason ? COLORS.status.error : status ? statusColor(status) : COLORS.text.muted,
                      fontWeight: slow ? TYPOGRAPHY.weight.bold : TYPOGRAPHY.weight.normal,
                    }}
                  >
                    {reason || status || ''}
                    {duration ? ` (${duration}ms)` : ''}
                  </td>
                </tr>
                {(reqHeaders || resHeaders || responseBody || gqlErrors) && (
                  <tr className="http-details-row">
                    <td colSpan={3}>
                      {reqHeaders && <HeadersDetail label="Request Headers" headers={reqHeaders} />}
                      {resHeaders && <HeadersDetail label="Response Headers" headers={resHeaders} />}
                      {gqlErrors && (
                        <div className="gql-errors">
                          <span className="gql-errors-label">GraphQL Errors:</span>
                          <pre className="gql-errors-body">{JSON.stringify(gqlErrors, null, 2)}</pre>
                        </div>
                      )}
                      {responseBody && (
                        <details className="response-body-detail">
                          <summary className="response-body-summary">Response Body</summary>
                          <pre className="response-body">{responseBody}</pre>
                        </details>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </details>
  );
};

// ─── Error Components ────────────────────────────────────────────────────────

const ErrorEntry = ({ breadcrumb }: { breadcrumb: Breadcrumb }) => {
  const { short, full, hasStack } = truncateError(breadcrumb.message);
  const isError = breadcrumb.level === 'error';
  const fg = isError ? COLORS.status.error : COLORS.status.warning;
  const count = breadcrumb.count ?? 1;

  return hasStack ? (
    <details className="error-entry" style={{ borderColor: `${fg}33` }}>
      <summary style={{ color: fg }}>
        <Badge text={getIcon(breadcrumb)} color={fg} /> {short}
        {count > 1 ? ` ×${count}` : ''}
      </summary>
      <pre className="stack-trace">{full}</pre>
    </details>
  ) : (
    <div className="error-line" style={{ color: fg }}>
      <Badge text={getIcon(breadcrumb)} color={fg} /> {breadcrumb.message}
      {count > 1 ? ` ×${count}` : ''}
    </div>
  );
};

// ─── Event Components (network, storage, etc.) ──────────────────────────────

const EventBadgeColor: Record<string, string> = {
  network: COLORS.accent.orange,
  storage: COLORS.accent.indigo,
  session: COLORS.accent.blue,
  visibility: COLORS.accent.purple,
  recording: COLORS.accent.purple,
};

const InfoEvent = ({ breadcrumb }: { breadcrumb: Breadcrumb }) => {
  const icon = getIcon(breadcrumb);
  const color = EventBadgeColor[breadcrumb.category] || COLORS.text.muted;
  const isOffline = breadcrumb.category === 'network' && breadcrumb.message === 'Offline';

  return (
    <div className={`info-event ${isOffline ? 'info-event-warning' : ''}`}>
      <span className="info-badge" style={{ color }}>
        {icon}
      </span>
      <span className="info-message">{breadcrumb.message}</span>
      {(breadcrumb.count ?? 1) > 1 && <span className="info-count">×{breadcrumb.count}</span>}
    </div>
  );
};

// ─── Timeline Components ─────────────────────────────────────────────────────

const AnchorRow = ({ anchor, children }: { anchor: Breadcrumb; children: Breadcrumb[] }) => {
  const isTrusted = anchor.data?.isTrusted ?? true;
  const isAutomated = !isTrusted && anchor.type === 'ui.click';
  const navType = anchor.data?.navType as string | undefined;

  let color = COLORS.text.muted;
  if (anchor.category === 'visibility') {
    color = COLORS.accent.purple;
  } else if (anchor.type === 'ui.click') {
    color = COLORS.accent.blue;
  } else if (anchor.type === 'ui.input') {
    color = COLORS.accent.indigo;
  } else if (anchor.type === 'ui.submit') {
    color = COLORS.accent.orange;
  } else if (anchor.type === 'navigation') {
    color = COLORS.accent.green;
  }

  // Split children by type
  const httpItems = children.filter((c) => c.type === 'http');
  const errorItems = children.filter((c) => c.level === 'error' || c.level === 'warning');
  const infoItems = children.filter((c) => c.type !== 'http' && c.level !== 'error' && c.level !== 'warning');

  return (
    <div className="anchor-container">
      <div className="anchor-row">
        <span className="time">{formatTime(anchor.timestamp)}</span>
        <Badge
          text={getIcon(anchor)}
          color={isAutomated ? COLORS.text.muted : color}
          bg={isAutomated ? `${COLORS.text.muted}08` : `${color}18`}
        />
        <div className="anchor-body">
          <span className="anchor-msg">
            {anchor.message}
            {anchor.data?.awayMs ? ` (${formatDuration(anchor.data.awayMs as number)})` : ''}
          </span>
          {navType && (
            <span className="anchor-nav-type">
              <NavTypeBadge navType={navType} />
              {anchor.data?.sameDocument === false && <Badge text="cross-doc" color={COLORS.text.muted} />}
              {anchor.data?.hashChange && <Badge text="hash" color={COLORS.accent.cyan} />}
              {anchor.data?.userInitiated && <Badge text="user" color={COLORS.accent.green} />}
            </span>
          )}
          {formatDetail(anchor) && <span className="anchor-detail">{formatDetail(anchor).trim()}</span>}
        </div>
      </div>
      {children.length > 0 && (
        <div className="children">
          {httpItems.length > 0 && <HttpTable items={httpItems} />}
          {errorItems.map((c, i) => (
            <ErrorEntry key={`err-${i}`} breadcrumb={c} />
          ))}
          {infoItems.map((c, i) => (
            <InfoEvent key={`info-${i}`} breadcrumb={c} />
          ))}
        </div>
      )}
    </div>
  );
};

const PageGroupComponent = ({ page, index }: { page: PageGroup; index: number }) => {
  const requests = page.anchors
    .flatMap((a) => a.children)
    .filter((b) => b.type === 'http' && b.data?.duration)
    .map((b) => ({
      name: b.message.substring(0, 30),
      duration: b.data?.duration as number,
      status: b.data?.status as number,
      timestamp: b.timestamp,
      level: b.level,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  return (
    <details
      id={`page-${index}`}
      className={`page-group ${getPageStatusClass(page)}`}
      open={getPageStatusClass(page) === 'has-errors'}
    >
      <summary className="page-header">
        <span className="page-time">{formatTime(page.enteredAt)}</span>
        <span className="page-url">{page.url}</span>
        {page.navType && <NavTypeBadge navType={page.navType} />}
        {page.duration && page.duration > 100 && <span className="page-duration">{formatDuration(page.duration)}</span>}
        {page.leftAt && <span className="page-exit">→ {formatTime(page.leftAt)}</span>}
      </summary>
      <div className="page-content">
        {page.anchors.map((g, i) => (
          <AnchorRow key={i} anchor={g.anchor} children={g.children} />
        ))}
        {requests.length > 0 && <Waterfall requests={requests} startTime={page.enteredAt} compact />}
      </div>
    </details>
  );
};

// ─── Failed Summary ──────────────────────────────────────────────────────────

const FailedSummary = ({ logs, pages }: { logs: Breadcrumb[]; pages: PageGroup[] }) => {
  const failed = logs.filter((b) => b.level === 'error' || b.level === 'warning');
  const videos = logs.filter((b) => b.type === 'video');

  if (!failed.length) {
    return null;
  }

  const groups: Record<string, ErrorGroup> = {};
  failed.forEach((b) => {
    const key = b.message.split('\n')[0].substring(0, 200);

    if (!groups[key]) {
      const page = pages.find((p) => p.enteredAt <= b.timestamp && (!p.leftAt || p.leftAt >= b.timestamp));
      const { short, full, hasStack } = truncateError(b.message);

      groups[key] = {
        count: 0,
        level: b.level,
        message: b.message,
        short,
        full,
        hasStack,
        timestamp: b.timestamp,
        page,
        videos: [],
        responseBody: b.data?.responseBody as string | undefined,
        gqlErrors: b.data?.gqlErrors as unknown[] | undefined,
      };
    }
    groups[key].count += b.count ?? 1;
    groups[key].timestamp = Math.min(groups[key].timestamp, b.timestamp);

    const video = videos.find((v) => v.data?.errorTimestamp === b.timestamp);
    if (video && !groups[key].videos.includes(video)) {
      groups[key].videos.push(video);
    }
  });

 
  return (
    <div className="failed-summary">
      <div className="failed-summary-header">
        <span className="failed-summary-title">FAILED SUMMARY</span>
        {videos.length > 0 && <Badge text="VIDEO" color={COLORS.accent.purple} count={videos.length} />}
      </div>
      <div className="failed-summary-stats">
        {failed.length} errors · {Object.keys(groups).length} unique
      </div>

      <div className="failed-summary-groups">
        {videos.map((v, i) => (
          <div className="video-player" key={i}>
            <video src={v.data?.base64 as string} controls preload="metadata" />
          </div>
        ))}
        {Object.values(groups)
          .sort((a, b) => b.count - a.count)
          .map((group, i) => (
            <details key={i} className="failed-group">
              <summary className="failed-group-summary">
                <span className="failed-group-time">{formatTime(group.timestamp)}</span>
                <Badge
                  text={`${group.count}×`}
                  color={group.level === 'error' ? COLORS.status.error : COLORS.status.warning}
                />
                <span className="failed-group-preview">{group.short.split('\n')[0]}</span>
                {group.page && <Badge text={getPageName(group.page.url)} color={COLORS.accent.green} />}
                {group.videos.length > 0 && <Badge text="VIDEO" color={COLORS.accent.purple} />}
              </summary>
              <div className="failed-group-detail">
                {group.hasStack ? (
                  <details className="stack-trace-details" open>
                    <summary className="stack-trace-summary">
                      <span style={{ color: group.level === 'error' ? COLORS.status.error : COLORS.status.warning }}>
                        Stack trace
                      </span>
                    </summary>
                    <pre className="stack-trace">{group.full}</pre>
                  </details>
                ) : (
                  <pre className="failed-group-message">{group.full}</pre>
                )}
                {group.gqlErrors && (
                  <div className="gql-errors">
                    <span className="gql-errors-label">GraphQL Errors:</span>
                    <pre className="gql-errors-body">{JSON.stringify(group.gqlErrors, null, 2)}</pre>
                  </div>
                )}
                {group.responseBody && (
                  <details className="response-body-detail">
                    <summary className="response-body-summary">Response Body</summary>
                    <pre className="response-body">{group.responseBody}</pre>
                  </details>
                )}
              </div>
              {group.videos.map((v, j) => (
                <details key={j} className="failed-video">
                  <summary className="failed-video-summary">
                    <Badge text="VIDEO" color={COLORS.accent.purple} />
                    <span className="video-message">{v.message}</span>
                    <span className="video-size">{v.data?.size as string}</span>
                  </summary>
                  <div className="video-player">
                    <video src={v.data?.base64 as string} controls preload="metadata" />
                  </div>
                </details>
              ))}
            </details>
          ))}
      </div>
    </div>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const REPORT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: ${TYPOGRAPHY.family.primary}; background: ${COLORS.bg.primary}; color: ${COLORS.text.secondary}; padding: ${SPACING['5xl']}; line-height:1.6; }

  .report-header { margin-bottom: ${SPACING['4xl']}; padding-bottom: ${SPACING['2xl']}; border-bottom: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .report-title { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.lg}; font-weight: ${TYPOGRAPHY.weight.bold}; color: ${COLORS.accent.blue}; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.wide}; margin-bottom: ${SPACING['2xl']}; }
  .env-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: ${SPACING.base} ${SPACING['3xl']}; }
  .env-item { font-size: ${TYPOGRAPHY.size.md}; display: flex; gap: ${SPACING.base}; }
  .env-label { color: ${COLORS.text.muted}; min-width: 60px; font-weight: ${TYPOGRAPHY.weight.medium}; }
  .env-value { color: ${COLORS.text.tertiary}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; word-break: break-all; }

  .stats { display: flex; gap: ${SPACING['2xl']}; margin-bottom: ${SPACING['3xl']}; flex-wrap: wrap; }
  .stat { padding: ${SPACING.lg} ${SPACING['2xl']}; background: ${COLORS.bg.secondary}; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; text-align: center; min-width: 80px; }
  .stat-value { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.xl}; font-weight: ${TYPOGRAPHY.weight.bold}; }
  .stat-label { font-size: ${TYPOGRAPHY.size.sm}; color: ${COLORS.text.muted}; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.normal}; margin-top: ${SPACING.xs}; }

  .nav-flow { margin-bottom: ${SPACING['4xl']}; padding: ${SPACING.xl} ${SPACING['2xl']}; background: ${COLORS.bg.secondary}; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; display: flex; align-items: center; gap: ${SPACING['2xl']}; flex-wrap: wrap; }
  .nav-flow-title { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; font-weight: ${TYPOGRAPHY.weight.bold}; color: ${COLORS.accent.blue}; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.normal}; }
  .nav-flow-steps { display: inline-flex; align-items: center; flex-wrap: wrap; gap: ${SPACING.base}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; }
  .nav-flow-step { padding: ${SPACING.xs} ${SPACING.base}; background: ${COLORS.bg.accent}; color: ${COLORS.text.tertiary}; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.dark}; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: ${SPACING.sm}; }
  .nav-flow-step:hover { border-color: ${COLORS.accent.blue}; color: ${COLORS.accent.blue}; }
  .nav-flow-step.has-errors { color: ${COLORS.status.error}; border-color: ${COLORS.status.error}; background: ${COLORS.bg.highlight}; }
  .nav-flow-arrow { color: ${COLORS.text.dim}; font-size: ${TYPOGRAPHY.size.md}; }
  .nav-type-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }

  .waterfall { margin-bottom: ${SPACING['2xl']}; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; background: ${COLORS.bg.primary}; }
  .waterfall-summary { display: flex; align-items: center; gap: ${SPACING['2xl']}; padding: ${SPACING.xl} ${SPACING['2xl']}; background: ${COLORS.bg.secondary}; cursor: pointer; list-style: none; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; border-bottom: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .waterfall-summary::-webkit-details-marker { display: none; }
  .waterfall-summary::before { content: '▶'; font-size: ${TYPOGRAPHY.size.sm}; color: ${COLORS.text.muted}; margin-right: ${SPACING.base}; }
  .waterfall[open] .waterfall-summary::before { content: '▼'; }
  .waterfall-title { font-weight: ${TYPOGRAPHY.weight.bold}; color: ${COLORS.accent.blue}; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.normal}; }
  .waterfall-stats { color: ${COLORS.text.muted}; }
  .waterfall-scale { display: flex; justify-content: space-between; padding: ${SPACING.base} ${SPACING['2xl']}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.sm}; color: ${COLORS.text.dim}; border-bottom: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .waterfall-requests { padding: ${SPACING.base} ${SPACING['2xl']}; display: flex; flex-direction: column; gap: ${SPACING.sm}; max-height: 400px; overflow-y: auto; }
  .waterfall-row { display: flex; align-items: center; gap: ${SPACING.base}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.sm}; }
  .waterfall-time { color: ${COLORS.text.dim}; }
  .waterfall-name { color: ${COLORS.text.tertiary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .waterfall-bar-container { flex: 1; height: 16px; background: ${COLORS.bg.tertiary}; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.medium}; }
  .waterfall-bar { height: 100%; min-width: 2px; }
  .waterfall-duration { color: ${COLORS.text.muted}; text-align: right; }
  .waterfall.compact .waterfall-scale { padding-left: 120px; }
  .waterfall.compact .waterfall-name { width: 120px; }

  .page-group { margin-bottom: ${SPACING['2xl']}; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; border-left-width: ${BORDERS.width.thick}; border-left-color: transparent; scroll-margin-top: ${SPACING['2xl']}; }
  .page-group.has-success { border-left-color: ${COLORS.status.success}; }
  .page-group.has-warnings { border-left-color: ${COLORS.status.warning}; }
  .page-group.has-errors { border-left-color: ${COLORS.status.error}; }
  .page-group summary { list-style: none; cursor: pointer; }
  .page-group summary::-webkit-details-marker { display: none; }
  .page-group summary::before { content: '▶'; font-size: ${TYPOGRAPHY.size.sm}; color: ${COLORS.text.muted}; margin-right: ${SPACING.base}; display: inline-block; }
  .page-group[open] summary::before { content: '▼'; }
  .page-header { display: flex; align-items: baseline; gap: ${SPACING['2xl']}; padding: ${SPACING.xl} ${SPACING['2xl']}; background: ${COLORS.bg.secondary}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; flex-wrap: wrap; }
  .page-time { color: ${COLORS.text.dim}; min-width: 62px; }
  .page-url { color: ${COLORS.text.tertiary}; word-break: break-all; flex: 1; }
  .page-duration { color: ${COLORS.text.muted}; }
  .page-exit { color: ${COLORS.text.dim}; }
  .page-content { padding: ${SPACING.base} 0; border-top: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }

  .anchor-container { border-bottom: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .anchor-container:last-child { border-bottom: none; }
  .anchor-row { display: flex; align-items: flex-start; gap: ${SPACING.lg}; padding: ${SPACING.base} ${SPACING['2xl']}; }
  .time { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.sm}; color: ${COLORS.text.dim}; min-width: 62px; padding-top: ${SPACING.xs}; }
  .anchor-body { flex: 1; min-width: 0; }
  .anchor-msg { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.md}; color: ${COLORS.text.primary}; word-break: break-all; }
  .anchor-detail { display: block; font-size: ${TYPOGRAPHY.size.base}; color: ${COLORS.text.muted}; margin-top: ${SPACING.xs}; }
  .anchor-nav-type { display: flex; gap: ${SPACING.sm}; margin-top: ${SPACING.xs}; }
  .children { margin-left: 124px; padding: ${SPACING.sm} 0 ${SPACING.base}; display: flex; flex-direction: column; gap: ${SPACING.md}; }

  .badge { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.xs}; font-weight: ${TYPOGRAPHY.weight.bold}; padding: ${SPACING.xs} ${SPACING.md}; border: ${BORDERS.width.thin} ${BORDERS.style}; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.tight}; min-width: 48px; text-align: center; display: inline-block; }

  .http-group summary { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; cursor: pointer; padding: ${SPACING.sm} ${SPACING.lg}; background: ${COLORS.bg.secondary}; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; list-style: none; user-select: none; display: inline-block; }
  .http-group summary::-webkit-details-marker { display: none; }
  .http-group summary::before { content: '▶ '; font-size: ${TYPOGRAPHY.size.xs}; color: ${COLORS.text.muted}; }
  .http-group[open] summary::before { content: '▼ '; }
  .http-table { margin-top: ${SPACING.md}; border-collapse: collapse; width: 100%; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; }
  .http-table td { padding: ${SPACING.xs} ${SPACING.base}; border-bottom: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; vertical-align: top; }
  .http-table tr:last-child td { border-bottom: none; }
  .http-details-row td { padding: ${SPACING.sm} ${SPACING.base} ${SPACING.lg}; }
  .url-cell { color: ${COLORS.text.tertiary}; word-break: break-all; max-width: 300px; }

  .headers-detail { margin-bottom: ${SPACING.sm}; }
  .headers-summary { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.xs}; color: ${COLORS.text.muted}; cursor: pointer; padding: ${SPACING.xs} 0; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.normal}; list-style: none; }
  .headers-summary::-webkit-details-marker { display: none; }
  .headers-summary::before { content: '▶ '; font-size: 8px; }
  .headers-detail[open] .headers-summary::before { content: '▼ '; }
  .headers-grid { padding: ${SPACING.sm} ${SPACING.lg}; background: ${COLORS.bg.tertiary}; font-size: ${TYPOGRAPHY.size.xs}; }
  .header-row { display: flex; gap: ${SPACING.base}; padding: 1px 0; }
  .header-key { color: ${COLORS.text.muted}; min-width: 120px; }
  .header-value { color: ${COLORS.text.tertiary}; word-break: break-all; }
  .header-value.masked { color: ${COLORS.status.warning}; }

  .gql-errors { margin: ${SPACING.sm} 0; }
  .gql-errors-label { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.xs}; color: ${COLORS.status.error}; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.normal}; }
  .gql-errors-body { padding: ${SPACING.sm} ${SPACING.lg}; background: ${COLORS.bg.tertiary}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.xs}; color: ${COLORS.status.error}; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }

  .response-body-detail { margin-top: ${SPACING.sm}; }
  .response-body-summary { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.xs}; color: ${COLORS.text.muted}; cursor: pointer; padding: ${SPACING.xs} 0; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.normal}; list-style: none; }
  .response-body-summary::-webkit-details-marker { display: none; }
  .response-body-summary::before { content: '▶ '; font-size: 8px; }
  .response-body-detail[open] .response-body-summary::before { content: '▼ '; }
  .response-body { padding: ${SPACING.sm} ${SPACING.lg}; background: ${COLORS.bg.tertiary}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.xs}; color: ${COLORS.text.tertiary}; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }

  .info-event { display: flex; align-items: center; gap: ${SPACING.base}; font-size: ${TYPOGRAPHY.size.base}; color: ${COLORS.text.muted}; padding: ${SPACING.sm} ${SPACING.base}; background: ${COLORS.bg.tertiary}; }
  .info-event-warning { background: rgba(243,156,18,0.05); border-left: 2px solid ${COLORS.status.warning}; }
  .info-badge { font-size: ${TYPOGRAPHY.size.sm}; text-transform: uppercase; font-weight: ${TYPOGRAPHY.weight.bold}; font-family: ${TYPOGRAPHY.family.mono}; }
  .info-message { flex: 1; font-family: ${TYPOGRAPHY.family.mono}; }
  .info-count { color: ${COLORS.text.tertiary}; background: ${COLORS.bg.highlight}; padding: ${SPACING.xs} ${SPACING.md}; font-size: ${TYPOGRAPHY.size.xs}; }

  .error-entry { border: ${BORDERS.width.thin} ${BORDERS.style}; overflow: hidden; }
  .error-entry summary { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; padding: ${SPACING.md} ${SPACING.lg}; cursor: pointer; display: flex; align-items: flex-start; gap: ${SPACING.md}; list-style: none; background: ${COLORS.bg.tertiary}; }
  .error-entry summary::-webkit-details-marker { display: none; }
  .stack-trace { padding: ${SPACING.lg} ${SPACING.xl}; background: ${COLORS.bg.primary}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.sm}; color: ${COLORS.text.tertiary}; line-height: 1.5; white-space: pre-wrap; max-height: 300px; overflow-y: auto; border-top: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .error-line { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; padding: ${SPACING.sm} ${SPACING.lg}; display: flex; align-items: flex-start; gap: ${SPACING.md}; background: ${COLORS.bg.tertiary}; }

  .stack-trace-details { margin-bottom: ${SPACING.lg}; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .stack-trace-summary { padding: ${SPACING.sm} ${SPACING.lg}; background: ${COLORS.bg.secondary}; cursor: pointer; list-style: none; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.xs}; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.normal}; }
  .stack-trace-summary::-webkit-details-marker { display: none; }
  .stack-trace-summary::before { content: '▶'; color: ${COLORS.text.muted}; margin-right: ${SPACING.sm}; }
  .stack-trace-details[open] .stack-trace-summary::before { content: '▼'; }

  .failed-summary { margin-top: ${SPACING['5xl']}; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; background: ${COLORS.bg.secondary}; }
  .failed-summary-header { display: flex; align-items: center; justify-content: space-between; padding: ${SPACING.xl} ${SPACING['2xl']}; background: ${COLORS.bg.tertiary}; border-bottom: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .failed-summary-title { font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.base}; font-weight: ${TYPOGRAPHY.weight.bold}; color: ${COLORS.status.error}; text-transform: uppercase; letter-spacing: ${TYPOGRAPHY.letterSpacing.wide}; }
  .failed-summary-stats { padding: ${SPACING.sm} ${SPACING['2xl']}; font-size: ${TYPOGRAPHY.size.sm}; color: ${COLORS.text.muted}; border-bottom: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .failed-summary-groups { padding: ${SPACING.base}; display: flex; flex-direction: column; gap: ${SPACING.base}; }
  .failed-group { border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; border-left-width: ${BORDERS.width.thick}; border-left-color: ${COLORS.status.error}; }
  .failed-group summary { list-style: none; cursor: pointer; }
  .failed-group summary::-webkit-details-marker { display: none; }
  .failed-group summary::before { content: '▶'; font-size: ${TYPOGRAPHY.size.xs}; color: ${COLORS.text.muted}; margin-right: ${SPACING.sm}; display: inline-block; }
  .failed-group[open] summary::before { content: '▼'; }
  .failed-group-summary { display: flex; align-items: center; gap: ${SPACING.lg}; padding: ${SPACING.sm} ${SPACING.lg}; background: ${COLORS.bg.tertiary}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.sm}; }
  .failed-group-time { color: ${COLORS.text.dim}; min-width: 62px; }
  .failed-group-preview { flex: 1; color: ${COLORS.text.primary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .failed-group-detail { padding: ${SPACING.lg}; background: ${COLORS.bg.primary}; border-top: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .failed-group-message { padding: ${SPACING.lg}; background: ${COLORS.bg.secondary}; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.sm}; color: ${COLORS.text.tertiary}; white-space: pre-wrap; border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }

  .failed-video { border: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; margin: ${SPACING.base} 0 0 ${SPACING.xl}; }
  .failed-video-summary { display: flex; align-items: center; gap: ${SPACING.xl}; padding: ${SPACING.sm} ${SPACING.base}; background: ${COLORS.bg.tertiary}; cursor: pointer; font-family: ${TYPOGRAPHY.family.mono}; font-size: ${TYPOGRAPHY.size.xs}; list-style: none; }
  .failed-video-summary::-webkit-details-marker { display: none; }
  .failed-video-summary::before { content: '▶'; font-size: ${TYPOGRAPHY.size.xs}; color: ${COLORS.text.muted}; margin-right: ${SPACING.sm}; }
  .failed-video[open] .failed-video-summary::before { content: '▼'; }
  .video-message { flex: 1; color: ${COLORS.accent.purple}; }
  .video-size { color: ${COLORS.text.muted}; }
  .video-player { padding: ${SPACING.base}; background: ${COLORS.bg.primary}; border-top: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; }
  .video-player video { width: 100%; max-height: 480px; display: block; }

  .report-footer { margin-top: ${SPACING['5xl']}; padding-top: ${SPACING['2xl']}; border-top: ${BORDERS.width.thin} ${BORDERS.style} ${COLORS.border.light}; font-size: ${TYPOGRAPHY.size.sm}; color: ${COLORS.text.dim}; text-align: center; font-family: ${TYPOGRAPHY.family.mono}; }
`;

// ─── Main Report ─────────────────────────────────────────────────────────────

export const Report = ({
  logs,
  url = typeof window !== 'undefined' ? window.location.href : '',
  ua = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  viewport = typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '',
  dpr = typeof window !== 'undefined' ? `${window.devicePixelRatio}x` : '',
  lang = typeof navigator !== 'undefined' ? navigator.language : '',
  theme = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : '',
  online = typeof navigator !== 'undefined' ? (navigator.onLine ? 'online' : 'offline') : '',
  timestamp = new Date().toISOString(),
}: ReportProps) => {
  const pages = groupByPageAndAnchor(logs);
  const stats = {
    pages: pages.length,
    totalHttp: logs.filter((b) => b.type === 'http').length,
    failedHttp: logs.filter((b) => b.type === 'http' && b.level !== 'info').length,
    networkErrors: logs.filter((b) => b.type === 'http' && b.level === 'error').length,
    appErrors: logs.filter((b) => b.type !== 'http' && b.level === 'error').length,
    warnings: logs.filter((b) => b.level === 'warning').length,
  };

  const globalRequests = logs
    .filter((b) => b.type === 'http' && b.data?.duration)
    .map((b) => ({
      name: b.message.substring(0, 40),
      duration: b.data?.duration as number,
      status: b.data?.status as number,
      timestamp: b.timestamp,
      level: b.level,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{`QA Breadcrumbs · ${timestamp}`}</title>
        <style dangerouslySetInnerHTML={{ __html: REPORT_STYLES }} />
      </head>
      <body>
        <div className="report-header">
          <div className="report-title">Witnesscrumbs</div>
          <div className="env-grid">
            <EnvItem label="URL" value={url} fullWidth />
            <EnvItem label="Date" value={timestamp} />
            <EnvItem label="Viewport" value={`${viewport} @ ${dpr}`} />
            <EnvItem label="Theme" value={theme} />
            <EnvItem label="Lang" value={lang} />
            <EnvItem label="Network" value={online} />
            <EnvItem label="UA" value={ua} fullWidth />
          </div>
        </div>

        <div className="stats">
          <Stat value={stats.pages} label="Pages" color={COLORS.accent.blue} />
          <Stat value={stats.totalHttp} label="Requests" color={COLORS.http.GET} />
          <Stat
            value={stats.failedHttp}
            label="Failed"
            color={stats.failedHttp ? COLORS.status.error : COLORS.status.success}
          />
          <Stat
            value={stats.networkErrors}
            label="Network err"
            color={stats.networkErrors ? COLORS.status.error : COLORS.status.success}
          />
          <Stat
            value={stats.appErrors}
            label="App err"
            color={stats.appErrors ? COLORS.status.error : COLORS.status.success}
          />
          <Stat
            value={stats.warnings}
            label="Warnings"
            color={stats.warnings ? COLORS.status.warning : COLORS.status.success}
          />
        </div>

        <NavigationFlow pages={pages} />

        <div className="pages">
          {pages.map((p, i) => (
            <PageGroupComponent key={i} page={p} index={i} />
          ))}
        </div>

        {globalRequests.length > 0 && <Waterfall requests={globalRequests} startTime={globalRequests[0].timestamp} />}
        <FailedSummary logs={logs} pages={pages} />

        <div className="report-footer">qa-breadcrumbs · {timestamp}</div>
      </body>
    </html>
  );
};

export const downloadReportAsHtml = (props: ReportProps): void => {
  const { renderToStaticMarkup } = require('react-dom/server');
  const html = renderToStaticMarkup(<Report {...props} />);
  const blob = new Blob([`<!DOCTYPE html>\n${html}`], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = props.filename || `qa-breadcrumbs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default Report;
