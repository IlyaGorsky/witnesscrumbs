import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, ALL_ROLES, getRoleConfig, buildRoleInstruction } from '../roles';

test('ALL_ROLES matches ROLES ids', () => {
  assert.deepEqual(ALL_ROLES, ROLES.map(r => r.id));
});

test('all role ids are unique', () => {
  const ids = ROLES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('getRoleConfig returns matching config', () => {
  for (const role of ROLES) {
    assert.equal(getRoleConfig(role.id as never), role);
  }
});

test('getRoleConfig throws on unknown role', () => {
  assert.throws(() => getRoleConfig('nope' as never), /Unknown role: nope/);
});

test('buildRoleInstruction includes label, focus and numbered output sections', () => {
  const cfg = ROLES[0];
  const text = buildRoleInstruction(cfg);
  assert.ok(text.startsWith(`You are a ${cfg.label}`));
  for (const f of cfg.focus) assert.ok(text.includes(`- ${f}`), `missing focus: ${f}`);
  cfg.outputFormat.forEach((s, i) => {
    assert.ok(text.includes(`${i + 1}. **${s.title}** — ${s.description}`));
  });
});

test('every role has non-empty focus and outputFormat', () => {
  for (const r of ROLES) {
    assert.ok(r.focus.length > 0, `${r.id} has empty focus`);
    assert.ok(r.outputFormat.length > 0, `${r.id} has empty outputFormat`);
    assert.ok(r.label.length > 0);
  }
});
