import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmPrompt, buildLlmPromptAllRoles } from '../buildPrompt';
import { ALL_ROLES } from '../roles';
import type { Breadcrumb } from '../../types';

const t0 = 1_700_000_000_000;

const logs: Breadcrumb[] = [
  { timestamp: t0, type: 'navigation', category: 'nav', message: '/x', level: 'info' },
  { timestamp: t0 + 1000, type: 'http', category: 'fetch', message: 'GET /a', level: 'error',
    data: { method: 'GET', url: 'https://x/a', status: 500 } },
  { timestamp: t0 + 2000, type: 'default', category: 'console.warn', message: 'w', level: 'warning' },
];

test('full prompt embeds JSON and full system prompt', () => {
  const { system, user } = buildLlmPrompt(logs, 'developer');
  assert.ok(system.includes('JSON array of breadcrumbs'));
  assert.ok(system.includes('Senior Frontend Developer'));
  assert.ok(user.includes('Breadcrumbs (JSON):'));
  assert.ok(user.includes('"timestamp"'));
});

test('compact prompt uses timeline and compact system prompt', () => {
  const { system, user } = buildLlmPrompt(logs, 'developer', undefined, true);
  assert.ok(system.includes('compact text timeline'));
  assert.ok(user.includes('Session timeline:'));
  assert.ok(!user.includes('```json'));
});

test('env block included only when context provided', () => {
  const { user: noCtx } = buildLlmPrompt(logs, 'qa');
  assert.ok(!noCtx.includes('Environment:'));

  const { user } = buildLlmPrompt(logs, 'qa', {
    url: 'https://app/x', ua: 'UA', viewport: '1x1', lang: 'ru', online: 'online',
  });
  assert.ok(user.includes('Environment:'));
  assert.ok(user.includes('Page URL: https://app/x'));
  assert.ok(user.includes('User-Agent: UA'));
  assert.ok(user.includes('Viewport: 1x1'));
  assert.ok(user.includes('Language: ru'));
  assert.ok(user.includes('Network: online'));
});

test('env block omits empty fields', () => {
  const { user } = buildLlmPrompt(logs, 'qa', { url: 'https://x' });
  assert.ok(user.includes('Page URL: https://x'));
  assert.ok(!user.includes('User-Agent:'));
});

test('stats block reflects counts', () => {
  const { user } = buildLlmPrompt(logs, 'qa');
  assert.ok(user.includes('3 breadcrumbs, 1 errors, 1 warnings, 1 failed HTTP requests.'));
});

test('buildLlmPromptAllRoles returns entry per role', () => {
  const all = buildLlmPromptAllRoles(logs);
  assert.deepEqual(Object.keys(all).sort(), [...ALL_ROLES].sort());
  for (const role of ALL_ROLES) {
    assert.ok(all[role].system.length > 0);
    assert.ok(all[role].user.length > 0);
  }
});
