import { Interceptor, PushFn } from './types';

export interface DomInterceptorConfig {
  attribute: string;
  inputDebounce: number;
  maskPasswords: boolean;
  ignoreSelector: string;
}

const DEFAULTS: DomInterceptorConfig = {
  attribute: 'data-qa',
  inputDebounce: 500,
  maskPasswords: true,
  ignoreSelector: '.qa-breadcrumbs-root',
};

export class DomInterceptor implements Interceptor {
  private config: DomInterceptorConfig;
  private push: PushFn = () => {};
  private inputTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingInput: {
    target: string;
    value: string;
    element: HTMLElement;
    isTrusted: boolean;
    timestamp: number;
  } | null = null;

  constructor(config: Partial<DomInterceptorConfig> = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  start(push: PushFn): void {
    this.push = push;
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('input', this.handleInput, true);
    document.addEventListener('submit', this.handleSubmit, true);
  }

  stop(): void {
    this.flushPendingInput();
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('input', this.handleInput, true);
    document.removeEventListener('submit', this.handleSubmit, true);
    this.push = () => {};
  }

  private resolveTarget(el: HTMLElement): string {
    const qaAttr = this.config.attribute;
    const qaEl = el.closest(`[${qaAttr}]`);
    if (qaEl) {
      return `[${qaAttr}="${qaEl.getAttribute(qaAttr)}"]`;
    }

    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute('aria-label');
    if (aria) {
      return `${tag}[aria-label="${aria}"]`;
    }

    const id = el.getAttribute('id');
    if (id) {
      return `${tag}#${id}`;
    }

    return tag;
  }

  private getReadableText(el: HTMLElement): string {
    // Оптимизация: если у узла много детей, чтение textContent может быть дорогим
    if (el.childElementCount > 5) {
      return '';
    }
    const text = el.textContent?.trim() || '';
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }

  private handleClick = (e: MouseEvent): void => {
    const timestamp = Date.now(); // Фиксируем время немедленно
    const target = e.target as HTMLElement;

    if (target.closest(this.config.ignoreSelector) || target.closest('.qa-recording-cursor')) {
      return;
    }

    this.push({
      type: 'ui.click',
      category: 'ui.click',
      message: this.resolveTarget(target),
      level: 'info',
      timestamp,
      data: {
        tag: target.tagName.toLowerCase(),
        text: this.getReadableText(target) || undefined,
        isTrusted: e.isTrusted,
      },
    });
  };

  private handleInput = (e: Event): void => {
    const timestamp = Date.now();
    const target = e.target as HTMLInputElement;

    if (target.closest(this.config.ignoreSelector)) {
      return;
    }

    const value = this.config.maskPasswords && target.type === 'password' ? '••••••' : target.value;

    const selector = this.resolveTarget(target);

    if (this.pendingInput?.target === selector) {
      this.pendingInput.value = value;
    } else {
      this.flushPendingInput();
      this.pendingInput = {
        target: selector,
        value,
        element: target,
        isTrusted: e.isTrusted,
        timestamp,
      };
    }

    if (this.inputTimer) {
      clearTimeout(this.inputTimer);
    }
    this.inputTimer = setTimeout(() => this.flushPendingInput(), this.config.inputDebounce);
  };

  private flushPendingInput(): void {
    if (!this.pendingInput) {
      return;
    }

    const { target, value, element, isTrusted, timestamp } = this.pendingInput;

    this.push({
      type: 'ui.input',
      category: 'ui.input',
      message: target,
      level: 'info',
      timestamp,
      data: {
        value,
        tag: element.tagName.toLowerCase(),
        ...(!isTrusted && { isTrusted: false }),
      },
    });

    this.pendingInput = null;
    if (this.inputTimer) {
      clearTimeout(this.inputTimer);
      this.inputTimer = null;
    }
  }

  private handleSubmit = (e: Event): void => {
    const timestamp = Date.now();
    const form = e.target as HTMLFormElement;

    if (form.closest(this.config.ignoreSelector)) {
      return;
    }

    queueMicrotask(() => {
      this.push({
        type: 'ui.submit',
        category: 'ui.submit',
        message: this.resolveTarget(form),
        level: 'info',
        timestamp,
        data: {
          action: form.action || undefined,
          method: form.method || 'get',
          ...(!e.isTrusted && { isTrusted: false }),
        },
      });
    });
  };
}
