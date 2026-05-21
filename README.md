# Witnesscrumbs

*Sentry tells you what's breaking globally. Witnesscrumbs tells you what exactly happened right here, right now. One is a dashboard, the other is a witness statement.*

Lightweight browser breadcrumb collector for debugging and diagnostics. Works with any web app — SPAs (React, Vue, Angular) and traditional multi-page sites alike. Captures user actions, network requests, errors, navigation, and other events — export a self-contained HTML report or copy raw JSON.


## Why

When something goes wrong for a user, developers usually get a screenshot and "it doesn't work". Witnesscrumbs automatically records everything happening in the browser and helps turn that into an actionable report.

### Who benefits

**For users and support** — no need to explain reproduction steps, just download the HTML report and attach it to a ticket. The full history of actions, requests, and errors is already inside.

**For QA** — exact sequence of actions, network state, navigation, console errors. Video recording captures the moment of the error with context before and after.

**For developers** — HTTP waterfall, response bodies for failed requests, GraphQL operations, long tasks, stack traces. Video recording shows exactly what was on screen when the error happened. Headless mode lets you integrate breadcrumb collection into any monitoring system.

### Two modes of operation

**Interactive (widget)** — the user sees a floating button, can browse logs, start video recording, and export a self-contained HTML report with one click. Best for support workflows and manual QA: the user triggers the report themselves and attaches it to a ticket.

**Headless (background)** — developers embed the collector without any UI. Breadcrumbs are collected silently in the background and can be sent to any monitoring system, bug tracker, or custom backend via the subscribe API. No widget, no video — just structured event data. Best for always-on diagnostics in production. You can also enrich breadcrumbs with data from other tools:

```ts
Sentry.addEventProcessor((event) => {
  collector.push({
    timestamp: Date.now(),
    type: 'user',
    category: 'sentry',
    message: `Sentry event ${event.event_id}`,
    level: 'error',
    data: { eventId: event.event_id, url: `https://sentry.io/issues/?query=${event.event_id}` },
  });
  return event;
});
```

Both modes use the same zero-dependency core. The widget is just a React layer on top.

### Ring buffer, not full session recording

Witnesscrumbs does not record the entire user session — it keeps only the last N events in a ring buffer. Old events are automatically evicted as new ones come in. This means constant memory usage regardless of session length, and the report always contains the most relevant context around the problem rather than hours of irrelevant activity. Recommended buffer size is 100–200 breadcrumbs, which typically covers 5–15 minutes of user activity depending on the app.

### Human-readable logs instead of CSS selectors

Clicks and inputs are logged not by technical selectors (`div.sc-kAzzGY > span`), but by `data-qa` / `data-testid` attributes that already exist in most projects for automated tests. These attributes typically describe business entities:

```
CLICK  [data-qa="add-to-cart"]
INPUT  [data-qa="search-field"]
CLICK  [data-qa="checkout-submit"]
```

The action log reads like a human-language scenario — even someone unfamiliar with the codebase can understand what the user was doing. If no `data-qa` attribute exists, Witnesscrumbs falls back to `aria-label`, `id`, and tag name.

## How It Compares

**Witnesscrumbs is not a replacement for Sentry, LogRocket, or Datadog** — it solves a different problem. Those tools build dashboards across thousands of sessions. Dashboards are powerful but require deep configuration to be readable, and they still lose individual sessions to quotas and rate limits. Witnesscrumbs gives you one thing they can't: a complete, readable snapshot of a single session that anyone — support, QA, a developer, or an LLM — can understand immediately, with zero setup.

<details>
<summary>Detailed comparison table</summary>

| | Witnesscrumbs | Sentry Replay | LogRocket | FullStory | Datadog RUM |
|---|---|---|---|---|---|
| **Data stays local** | Yes — nothing leaves the browser | Cloud or heavy self-hosted (20+ containers) | Cloud only (self-host = enterprise) | Cloud only | Cloud only |
| **Self-contained HTML report** | Yes — one file, works offline | No — requires dashboard | No — requires dashboard | No — requires dashboard | No — requires dashboard |
| **Human-readable logs** | `data-qa` / `data-testid` attributes | Raw CSS selectors | Raw CSS selectors | Raw DOM paths | Raw CSS selectors |
| **Core dependencies** | Zero | ~30 KB+ gzipped SDK | 8 KB shim + async payload | Heavy loader + async | SDK + platform lock-in |
| **Video recording** | Real screen capture (`getDisplayMedia`) | DOM reconstruction (misses canvas/WebGL) | DOM reconstruction | DOM reconstruction | DOM reconstruction |
| **Headless mode** | Yes — plug into any backend | Tied to Sentry | Tied to LogRocket | Tied to FullStory | Tied to Datadog |
| **Pricing** | Free, MIT | Free tier, then ~$26+/mo | Free tier, then $69+/mo | Free tier, then ~$2K+/yr | $1.50/1K sessions |
| **Open source** | Yes | Partially | No | No | No |

**Where they win:** Sentry has full-stack error tracking with source maps and alerting. LogRocket has Redux/Vuex state diffs and AI frustration detection. FullStory has heatmaps, funnels, and product analytics. Datadog correlates frontend sessions with backend traces and infrastructure metrics.

</details>

## Features

- **UI tracking** — clicks, input (with debounce and password masking), form submissions; resolves elements via `data-qa` attributes
- **HTTP interception** — monkey-patches `fetch` and `XMLHttpRequest`; GraphQL support (operation names, mutation/query, response errors); sanitization of sensitive headers and URL parameters
- **Console and errors** — intercepts `console.error`, `window.onerror`, unhandled promise rejections
- **Navigation** — Navigation API (Chrome 102+) with fallback to `pushState`/`popstate`/`hashchange`; transition type (push, replace, back/forward, reload)
- **Performance** — `PerformanceObserver` for long tasks (threshold >100ms) with batching
- **Storage** — intercepts `localStorage` setItem/removeItem/clear
- **Visibility and network** — tab hide/show (with away duration), online/offline
- **Video recording** — screen capture via `getDisplayMedia` with a ring buffer of 1s chunks; two modes: error clip (N seconds before/after the error, synced with the breadcrumb timeline) or full session recording embedded in the report
- **Persistence** — ring buffer in `sessionStorage`, survives page reloads
- **Deduplication** — repeated errors/warnings within 2s are collapsed with a counter; batching via `batchKey`
- **Export** — self-contained HTML report with page grouping, error summary, HTTP waterfall, embedded video; or JSON to console
- **AI-ready** — built-in LLM prompt generator that formats breadcrumbs for AI analysis with role-specific instructions (developer, QA, support, manager). Paste the prompt into ChatGPT/Claude and get a structured bug interpretation instantly

## Quick Start

```tsx
import { WitnesscrumbsWidget } from 'witnesscrumbs/src/view/WitnesscrumbsWidgets';

function App() {
  return (
    <>
      <YourApp />
      <WitnesscrumbsWidget />
    </>
  );
}
```

The widget appears in the bottom-right corner — a floating button with an event counter. Clicking it opens a panel with logs, export buttons, and video recording controls.

## Configuration

All parameters are optional:

```tsx
<WitnesscrumbsWidget
  attribute="data-qa"       // data-attribute for element name resolution (default: "data-qa")
  bufferSize={150}          // max breadcrumbs in ring buffer (default: 100, recommended: 100–200)
  inputDebounce={500}       // debounce ms for input grouping (default: 500)
  maskPasswords={true}      // mask password field values (default: true)
  interceptHttp={true}      // intercept fetch/XHR (default: true)
  httpFilter="same-origin"  // 'same-origin' | 'all' (default: 'same-origin')
  captureErrors={true}      // capture window errors (default: true)
  captureConsole={true}     // capture console.error (default: true)
  persist={true}            // persist to sessionStorage across reloads (default: true)
  storageKey="__qa_breadcrumbs" // sessionStorage key (default: '__qa_breadcrumbs')
  videoConfig={{
    bufferSeconds: 60,      // ring buffer duration (default: 60)
    secondsBefore: 5,       // seconds before error to save (default: 5)
    secondsAfter: 5,        // seconds after error to save (default: 5)
  }}
/>
```

## Headless Usage (no UI)

The core can be used independently from the React widget — for example, to send breadcrumbs to a monitoring system or bug tracker:

```ts
import { BreadcrumbsCollector } from 'witnesscrumbs/src/core/BreadcrumbsCollector';

const collector = new BreadcrumbsCollector({
  attribute: 'data-qa',
  interceptHttp: true,
});

collector.start();

// Subscribe to new breadcrumbs
const unsubscribe = collector.subscribe((breadcrumb) => {
  console.log(breadcrumb);
});

// Get all collected logs
const logs = collector.getLogs();

// Add a custom breadcrumb
collector.push({
  timestamp: Date.now(),
  type: 'user',
  category: 'custom',
  message: 'User completed onboarding',
  level: 'info',
});

// Cleanup
collector.stop();
unsubscribe();
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+L` | Toggle breadcrumbs panel |
| `Alt+Shift+V` | Start/stop video recording |
| `Alt+Shift+C` | Copy JSON to console |
| `Alt+Shift+X` | Clear breadcrumbs |

## Architecture

```
src/
├── core/                        # Core, no framework dependencies
│   ├── types.ts                 # Breadcrumb, PushFn, Interceptor interfaces
│   ├── BreadcrumbsCollector.ts  # Central collector: ring buffer, deduplication, persistence
│   ├── VideoRec.ts              # Screen recording via getDisplayMedia
│   ├── DomInterceptor.ts        # Clicks, input, form submissions
│   ├── ConsoleInterceptor.ts    # console.error, window.onerror, unhandledrejection
│   ├── HttpInterceptor.ts       # Monkey-patch fetch/XHR, GraphQL support
│   ├── NavigationInterceptor.ts # Navigation API / History API fallback
│   ├── PerformanceInterceptor.ts# Long task detection via PerformanceObserver
│   ├── StorageInterceptor.ts    # Monkey-patch localStorage
│   └── VisibilityInterceptor.ts # Tab visibility, online/offline
└── view/                        # React UI layer
    ├── display.ts               # Icons, formatting, design tokens
    ├── WitnesscrumbsWidgets.tsx # Floating panel (React component)
    └── WitnesscrumbsReport.tsx  # Self-contained HTML report generator
```

### Interceptor Pattern

All interceptors implement a common interface:

```ts
interface Interceptor {
  start(push: PushFn): void;
  stop(): void;
}
```

`BreadcrumbsCollector` creates all interceptors and passes them the `push` function. Each interceptor monkey-patches browser APIs on `start()` and restores originals on `stop()`.

### Breadcrumb Schema

```ts
interface Breadcrumb {
  timestamp: number;
  type: 'default' | 'http' | 'navigation' | 'ui.click' | 'ui.input' | 'ui.submit' | 'user' | 'video';
  category: string;      // e.g. 'console.error', 'graphql', 'fetch', 'storage', 'visibility'
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
  count?: number;         // deduplication counter
  shouldBatch?: boolean;  // enable batching by batchKey
  batchKey?: string;      // grouping key for deduplication
}
```

### Data Flow

```
Browser events ──► Interceptors ──► push() ──► BreadcrumbsCollector
                                                      │
                                        ┌─────────────┼─────────────┐
                                        ▼             ▼             ▼
                                   Ring Buffer   sessionStorage  Subscribers
                                        │                          │
                                        ▼                          ▼
                                  getLogs()            WitnesscrumbsWidget
                                        │                     │
                                        ▼                     ▼
                                  HTML report           Floating panel
```

## Browser Support

- **Full**: Chrome/Edge 102+ (Navigation API, `getDisplayMedia` with `preferCurrentTab`)
- **Partial**: Safari, Firefox — fallback to History API for navigation; video recording requires manual tab selection

## Dependencies

- **Core**: zero dependencies, browser APIs only
- **View**: React (peer dependency)
