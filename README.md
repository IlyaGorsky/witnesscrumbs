# Witnesscrumbs

Легковесный браузерный сборщик «хлебных крошек» для отладки и диагностики. Перехватывает действия пользователя, сетевые запросы, ошибки, навигацию и другие события — позволяет экспортировать самодостаточный HTML-отчёт или скопировать сырой JSON.

## Зачем

Когда у пользователя что-то идёт не так, обычно разработчик получает скриншот и фразу «не работает». Witnesscrumbs автоматически записывает всё, что происходило в браузере — и по нажатию одной кнопки формирует полный отчёт, который можно передать разработчику или в поддержку.

**Для пользователей и поддержки** — не нужно объяснять шаги воспроизведения, достаточно скачать HTML-отчёт и приложить к тикету. Вся история действий, запросов и ошибок уже внутри.

**Для QA** — видно точную последовательность действий, состояние сети, навигацию, ошибки консоли. Видеозапись фиксирует момент ошибки с контекстом до и после.

**Для разработчиков** — HTTP waterfall, тела ответов на ошибочные запросы, GraphQL-операции, long tasks, стектрейсы. Headless-режим позволяет встроить сбор крошек в любую систему мониторинга.

### Читаемые логи вместо CSS-селекторов

Ключевая особенность — клики и ввод логируются не по техническим селекторам (`div.sc-kAzzGY > span`), а по `data-qa` / `data-testid` атрибутам, которые уже есть в большинстве проектов для автотестов. Эти атрибуты обычно описывают бизнес-сущности:

```
CLICK  [data-qa="add-to-cart"]
INPUT  [data-qa="search-field"]
CLICK  [data-qa="checkout-submit"]
```

В результате лог действий читается как сценарий на человеческом языке — даже тот, кто не знает кодовую базу, поймёт, что делал пользователь. Если `data-qa` атрибута нет, Witnesscrumbs фолбэчится на `aria-label`, `id` и тег элемента.

## Возможности

- **UI-трекинг** — клики, ввод (с debounce и маскировкой паролей), отправка форм; резолвит элементы через `data-qa` атрибуты
- **Перехват HTTP** — monkey-patch `fetch` и `XMLHttpRequest`; поддержка GraphQL (имена операций, mutation/query, ошибки в ответе); санитизация чувствительных заголовков и URL-параметров
- **Консоль и ошибки** — перехват `console.error`, `window.onerror`, необработанные промисы
- **Навигация** — Navigation API (Chrome 102+) с фолбэком на `pushState`/`popstate`/`hashchange`; тип перехода (push, replace, back/forward, reload)
- **Производительность** — `PerformanceObserver` для long tasks (порог >100мс) с батчингом
- **Storage** — перехват `localStorage` setItem/removeItem/clear
- **Видимость и сеть** — скрытие/показ вкладки (с длительностью отсутствия), online/offline
- **Видеозапись** — захват экрана через `getDisplayMedia` с кольцевым буфером чанков по 1с; сохранение фрагмента вокруг ошибки (N секунд до/после)
- **Персистентность** — ring buffer в `sessionStorage`, переживает перезагрузку страницы
- **Дедупликация** — повторяющиеся ошибки/предупреждения в пределах 2с схлопываются со счётчиком; батчинг через `batchKey`
- **Экспорт** — самодостаточный HTML-отчёт с группировкой по страницам, сводкой ошибок, HTTP waterfall, встроенным видео; или JSON в консоль

## Быстрый старт

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

Виджет появится в правом нижнем углу — круглая кнопка со счётчиком событий. По клику открывается панель с логами, кнопками экспорта и видеозаписи.

## Конфигурация

Все параметры опциональны:

```tsx
<WitnesscrumbsWidget
  attribute="data-qa"       // data-атрибут для резолва имён элементов (по умолчанию: "data-qa")
  bufferSize={30}           // макс. кол-во крошек в ring buffer (по умолчанию: 30)
  inputDebounce={500}       // debounce мс для группировки ввода (по умолчанию: 500)
  maskPasswords={true}      // маскировать значения паролей (по умолчанию: true)
  interceptHttp={true}      // перехватывать fetch/XHR (по умолчанию: true)
  httpFilter="same-origin"  // 'same-origin' | 'all' (по умолчанию: 'same-origin')
  captureErrors={true}      // перехватывать ошибки window (по умолчанию: true)
  captureConsole={true}     // перехватывать console.error (по умолчанию: true)
  persist={true}            // сохранять в sessionStorage между перезагрузками (по умолчанию: true)
  storageKey="__qa_breadcrumbs" // ключ sessionStorage (по умолчанию: '__qa_breadcrumbs')
  videoConfig={{
    bufferSeconds: 60,      // длительность кольцевого буфера (по умолчанию: 60)
    secondsBefore: 5,       // секунд до ошибки для сохранения (по умолчанию: 5)
    secondsAfter: 5,        // секунд после ошибки для сохранения (по умолчанию: 5)
  }}
/>
```

## Использование без UI (headless)

Ядро можно использовать отдельно от React-виджета — например, для автоматической отправки крошек в систему мониторинга или баг-трекер:

```ts
import { BreadcrumbsCollector } from 'witnesscrumbs/src/core/BreadcrumbsCollector';

const collector = new BreadcrumbsCollector({
  attribute: 'data-qa',
  interceptHttp: true,
});

collector.start();

// Подписка на новые крошки
const unsubscribe = collector.subscribe((breadcrumb) => {
  console.log(breadcrumb);
});

// Получить все собранные логи
const logs = collector.getLogs();

// Добавить пользовательскую крошку
collector.push({
  timestamp: Date.now(),
  type: 'user',
  category: 'custom',
  message: 'Пользователь завершил онбординг',
  level: 'info',
});

// Очистка
collector.stop();
unsubscribe();
```

## Горячие клавиши виджета

| Сочетание | Действие |
|---|---|
| `Alt+Shift+L` | Открыть/закрыть панель крошек |
| `Alt+Shift+V` | Начать/остановить видеозапись |
| `Alt+Shift+C` | Скопировать JSON в консоль |
| `Alt+Shift+X` | Очистить крошки |

## Архитектура

```
src/
├── core/                        # Ядро, без зависимостей от фреймворков
│   ├── types.ts                 # Интерфейсы Breadcrumb, PushFn, Interceptor
│   ├── BreadcrumbsCollector.ts  # Центральный коллектор: ring buffer, дедупликация, персистентность
│   ├── VideoRec.ts              # Запись экрана через getDisplayMedia
│   ├── DomInterceptor.ts        # Клики, ввод, отправка форм
│   ├── ConsoleInterceptor.ts    # console.error, window.onerror, unhandledrejection
│   ├── HttpInterceptor.ts       # Monkey-patch fetch/XHR, поддержка GraphQL
│   ├── NavigationInterceptor.ts # Navigation API / History API фолбэк
│   ├── PerformanceInterceptor.ts# Обнаружение long tasks через PerformanceObserver
│   ├── StorageInterceptor.ts    # Monkey-patch localStorage
│   └── VisibilityInterceptor.ts # Видимость вкладки, online/offline
└── view/                        # React UI-слой
    ├── dispay.ts                # Иконки, форматирование, дизайн-токены
    ├── WitnesscrumbsWidgets.tsx # Плавающая панель (React-компонент)
    └── WitnesscrumbsReport.tsx  # Генератор самодостаточного HTML-отчёта
```

### Паттерн интерцепторов

Все интерцепторы реализуют общий интерфейс:

```ts
interface Interceptor {
  start(push: PushFn): void;
  stop(): void;
}
```

`BreadcrumbsCollector` создаёт все интерцепторы и передаёт им функцию `push`. Каждый интерцептор при `start()` подменяет браузерные API, при `stop()` — восстанавливает оригиналы.

### Схема Breadcrumb

```ts
interface Breadcrumb {
  timestamp: number;
  type: 'default' | 'http' | 'navigation' | 'ui.click' | 'ui.input' | 'ui.submit' | 'user' | 'video';
  category: string;      // напр. 'console.error', 'graphql', 'fetch', 'storage', 'visibility'
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
  count?: number;         // счётчик дедупликации
  shouldBatch?: boolean;  // включить батчинг по batchKey
  batchKey?: string;      // ключ группировки для дедупликации
}
```

### Поток данных

```
События браузера ──► Интерцепторы ──► push() ──► BreadcrumbsCollector
                                                      │
                                        ┌─────────────┼─────────────┐
                                        ▼             ▼             ▼
                                   Ring Buffer   sessionStorage  Подписчики
                                        │                          │
                                        ▼                          ▼
                                  getLogs()            WitnesscrumbsWidget
                                        │                     │
                                        ▼                     ▼
                                  HTML-отчёт           Плавающая панель
```

## Поддержка браузеров

- **Полная**: Chrome/Edge 102+ (Navigation API, `getDisplayMedia` с `preferCurrentTab`)
- **Частичная**: Safari, Firefox — фолбэк на History API для навигации; видеозапись требует ручного выбора вкладки

## Зависимости

- **Core**: ноль зависимостей, только браузерные API
- **View**: React (peer dependency)
