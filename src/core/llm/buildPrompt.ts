import type { Breadcrumb } from '../types';
import type { Role } from './roles';
import { ALL_ROLES, getRoleConfig, buildRoleInstruction } from './roles';
import { SYSTEM_PROMPT_FULL, SYSTEM_PROMPT_COMPACT } from './systemPrompts';
import { compactBreadcrumbs } from './compactFormatter';

export interface SessionContext {
  url?: string;
  ua?: string;
  viewport?: string;
  lang?: string;
  online?: string;
}

function buildEnvBlock(context?: SessionContext): string {
  if (!context) return '';
  const lines: string[] = [];
  if (context.url) lines.push(`Page URL: ${context.url}`);
  if (context.ua) lines.push(`User-Agent: ${context.ua}`);
  if (context.viewport) lines.push(`Viewport: ${context.viewport}`);
  if (context.lang) lines.push(`Language: ${context.lang}`);
  if (context.online) lines.push(`Network: ${context.online}`);
  return lines.length > 0 ? `\n\nEnvironment:\n${lines.join('\n')}` : '';
}

function buildStatsBlock(logs: Breadcrumb[]): string {
  const errorCount = logs.filter(l => l.level === 'error').length;
  const warningCount = logs.filter(l => l.level === 'warning').length;
  const httpErrors = logs.filter(l => l.type === 'http' && l.level === 'error').length;
  return `\nQuick stats: ${logs.length} breadcrumbs, ${errorCount} errors, ${warningCount} warnings, ${httpErrors} failed HTTP requests.`;
}

export function buildLlmPrompt(
  logs: Breadcrumb[],
  role: Role,
  context?: SessionContext,
  compact?: boolean,
): { system: string; user: string } {
  const roleConfig = getRoleConfig(role);
  const systemBase = compact ? SYSTEM_PROMPT_COMPACT : SYSTEM_PROMPT_FULL;
  const system = `${systemBase}\n\n${buildRoleInstruction(roleConfig)}`;

  const logsBlock = compact
    ? `Session timeline:\n${compactBreadcrumbs(logs)}`
    : `Breadcrumbs (JSON):\n\`\`\`json\n${JSON.stringify(logs, null, 2)}\n\`\`\``;

  const user = `Analyze the following browser session and provide a bug interpretation.${buildEnvBlock(context)}${buildStatsBlock(logs)}\n\n${logsBlock}`;

  return { system, user };
}

export function buildLlmPromptAllRoles(
  logs: Breadcrumb[],
  context?: SessionContext,
): Record<Role, { system: string; user: string }> {
  return Object.fromEntries(
    ALL_ROLES.map(role => [role, buildLlmPrompt(logs, role, context)]),
  ) as Record<Role, { system: string; user: string }>;
}
