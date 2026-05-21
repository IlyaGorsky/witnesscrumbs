export type { Breadcrumb, PushFn, Interceptor } from './core/types';
export {
  BreadcrumbsCollector,
  type BreadcrumbsCollectorConfig,
  type BreadcrumbListener,
} from './core/BreadcrumbsCollector';
export { VideoRecorder } from './core/VideoRec';

export {
  compactBreadcrumbs,
  buildLlmPrompt,
  buildLlmPromptAllRoles,
  getRoleConfig,
  ALL_ROLES,
  ROLES,
  type Role,
  type RoleConfig,
  type Section,
  type SessionContext,
} from './core/llm';

export {
  Report,
  downloadReportAsHtml,
} from './view/WitnesscrumbsReport';
export {
  WitnesscrumbsWidget,
  formatDuration,
  type QaBreadcrumbsWidgetProps,
} from './view/WitnesscrumbsWidgets';
