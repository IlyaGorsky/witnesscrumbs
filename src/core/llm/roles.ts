export interface Section {
  title: string;
  description: string;
}

export interface RoleConfig {
  id: string;
  label: string;
  focus: string[];
  outputFormat: Section[];
}

export const ROLES: RoleConfig[] = [
  {
    id: 'developer',
    label: 'Senior Frontend Developer',
    focus: [
      'Root cause analysis: what exactly failed and why',
      'Stack traces, error messages, and their origin',
      'HTTP requests: status codes, failed endpoints, response bodies, GraphQL errors',
      'Performance issues: long tasks, slow requests, timing patterns',
      'State management clues: localStorage changes, navigation sequence',
      'Console errors and warnings preceding the bug',
      'Browser/environment specifics that may affect behavior',
    ],
    outputFormat: [
      { title: 'Root Cause', description: 'most likely technical reason for the bug' },
      { title: 'Evidence', description: 'specific breadcrumbs supporting your conclusion (with timestamps)' },
      { title: 'Affected Code', description: 'endpoints, components, or modules involved' },
      { title: 'Reproduction Steps', description: 'minimal technical steps to reproduce' },
      { title: 'Suggested Fix', description: 'concrete code-level recommendations' },
      { title: 'Related Issues', description: 'secondary problems noticed in the logs' },
    ],
  },
  {
    id: 'qa',
    label: 'QA Engineer',
    focus: [
      'Exact user actions that led to the bug (click, input, navigation sequence)',
      'Expected vs actual behavior',
      'Environment details (browser, viewport, network status)',
      'Reproducibility: is the sequence deterministic or timing-dependent?',
      'Severity assessment based on user impact',
      'Edge cases visible in the data (rapid clicks, network drops, tab switches)',
    ],
    outputFormat: [
      { title: 'Summary', description: 'one-line description of the bug' },
      { title: 'Severity', description: 'Critical / Major / Minor / Trivial with justification' },
      { title: 'Steps to Reproduce', description: 'numbered list from user actions in the breadcrumbs' },
      { title: 'Expected Result', description: 'what should have happened' },
      { title: 'Actual Result', description: 'what went wrong (with error details)' },
      { title: 'Environment', description: 'browser, viewport, network, relevant conditions' },
      { title: 'Reproducibility', description: 'Always / Often / Sometimes / Rare' },
      { title: 'Additional Notes', description: 'patterns, edge cases, related observations' },
    ],
  },
  {
    id: 'support',
    label: 'Customer Support Specialist',
    focus: [
      'What the user was trying to do (in plain language)',
      'What went wrong from the user\'s perspective',
      'Impact on the user\'s workflow',
      'Whether this is a known pattern or something new',
      'Urgency and workaround possibilities',
    ],
    outputFormat: [
      { title: 'What Happened', description: 'simple, non-technical explanation' },
      { title: 'What the User Was Doing', description: 'plain-language description of user actions' },
      { title: 'Impact', description: 'how this affects the user\'s ability to use the product' },
      { title: 'Workaround', description: 'if any workaround is possible based on the data' },
      { title: 'Urgency', description: 'High / Medium / Low with reasoning' },
      { title: 'Suggested Response', description: 'draft reply to the user' },
    ],
  },
  {
    id: 'manager',
    label: 'Product/Engineering Manager',
    focus: [
      'Business impact and user-facing consequences',
      'Severity and urgency for prioritization',
      'Which team/area owns this issue',
      'Whether this looks like a regression or a new issue',
      'Scope: how many users might be affected (based on the trigger conditions)',
    ],
    outputFormat: [
      { title: 'Issue Summary', description: 'one paragraph, non-technical' },
      { title: 'Business Impact', description: 'effect on users and product' },
      { title: 'Priority Recommendation', description: 'P0-P3 with justification' },
      { title: 'Ownership', description: 'which team/area should handle this (frontend, backend, infra, etc.)' },
      { title: 'Scope Estimate', description: 'likely affected user segment' },
      { title: 'Timeline Suggestion', description: 'how urgently this needs attention' },
    ],
  },
];

/** All available role IDs */
export const ALL_ROLES = ROLES.map(r => r.id) as Role[];

/** Union type of all role IDs */
export type Role = typeof ROLES[number]['id'];

/** Get role config by ID */
export function getRoleConfig(role: Role): RoleConfig {
  const config = ROLES.find(r => r.id === role);
  if (!config) throw new Error(`Unknown role: ${role}`);
  return config;
}

/** Build role instruction text from structured config */
export function buildRoleInstruction(config: RoleConfig): string {
  const focusBlock = config.focus.map(f => `- ${f}`).join('\n');

  const formatBlock = config.outputFormat
    .map((s, i) => `${i + 1}. **${s.title}** — ${s.description}`)
    .join('\n');

  return `You are a ${config.label} analyzing a bug report.

Focus on:
${focusBlock}

Output format (follow this structure strictly):
${formatBlock}`;
}
