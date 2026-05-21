import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactBreadcrumbs } from '../compactFormatter';
import type { Breadcrumb } from '../../types';

const t0 = 1_700_000_000_000;

const crumb = (overrides: Partial<Breadcrumb> = {}): Breadcrumb => ({
  timestamp: t0,
  type: 'default',
  category: 'log',
  message: 'msg',
  level: 'info',
  ...overrides,
});

test('returns placeholder for empty input', () => {
  assert.equal(compactBreadcrumbs([]), '(no breadcrumbs)');
});

test('formats relative timestamp as MM:SS.mmm from first crumb', () => {
  const out = compactBreadcrumbs([
    crumb({ timestamp: t0 }),
    crumb({ timestamp: t0 + 65_123 }),
  ]);
  const lines = out.split('\n');
  assert.match(lines[0], /^00:00\.000 /);
  assert.match(lines[1], /^01:05\.123 /);
});

test('maps types to tags', () => {
  const cases: Array<[Partial<Breadcrumb>, string]> = [
    [{ type: 'ui.click' }, 'CLICK'],
    [{ type: 'ui.input' }, 'INPUT'],
    [{ type: 'ui.submit' }, 'SUBMIT'],
    [{ type: 'navigation' }, 'NAV'],
    [{ type: 'user' }, 'USER'],
    [{ type: 'video' }, 'VID'],
    [{ type: 'http', category: 'graphql' }, 'GQL'],
    [{ type: 'http', data: { method: 'POST' } }, 'POST'],
    [{ category: 'console.error' }, 'ERR'],
    [{ category: 'console.warn' }, 'WARN'],
    [{ category: 'longtask' }, 'SLOW'],
    [{ category: 'network' }, 'NET'],
    [{ category: 'storage' }, 'LS'],
    [{ category: 'visibility' }, 'TAB'],
    [{ category: 'unknown' }, 'LOG'],
  ];
  for (const [input, tag] of cases) {
    const out = compactBreadcrumbs([crumb(input)]);
    assert.match(out, new RegExp(` ${tag} `), `expected tag ${tag} for ${JSON.stringify(input)}`);
  }
});

test('http detail strips origin and adds status/duration', () => {
  const out = compactBreadcrumbs([crumb({
    type: 'http',
    data: { method: 'GET', url: 'https://api.example.com/v1/users', status: 500, duration: 320 },
  })]);
  assert.ok(out.includes('GET /v1/users'));
  assert.ok(out.includes('→ 500'));
  assert.ok(out.includes('320ms'));
});

test('http detail marks gqlErrors', () => {
  const out = compactBreadcrumbs([crumb({
    type: 'http',
    data: { method: 'POST', url: 'https://x/graphql', gqlErrors: true },
  })]);
  assert.ok(out.includes('GQL_ERR'));
});

test('non-http detail includes text/value/url/reason/error', () => {
  const out = compactBreadcrumbs([crumb({
    type: 'ui.input',
    data: { text: 'name', value: 'Bob', reason: 'changed' },
  })]);
  assert.ok(out.includes('"name"'));
  assert.ok(out.includes('→ "Bob"'));
  assert.ok(out.includes('(changed)'));
});

test('appends count suffix when >1', () => {
  const out = compactBreadcrumbs([crumb({ count: 5 })]);
  assert.ok(out.endsWith('x5'));
});

test('appends severity marker', () => {
  const err = compactBreadcrumbs([crumb({ level: 'error' })]);
  const warn = compactBreadcrumbs([crumb({ level: 'warning' })]);
  const info = compactBreadcrumbs([crumb({ level: 'info' })]);
  assert.ok(err.endsWith(' !!!'));
  assert.ok(warn.endsWith(' !'));
  assert.ok(!info.endsWith('!'));
});
