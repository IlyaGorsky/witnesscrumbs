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
  private pendingInput: { target: string; value: string; element: HTMLElement; isTrusted: boolean } | null = null;

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
    const qaEl = el.closest(`[${this.config.attribute}]`);
    if (qaEl) {
      return `[${this.config.attribute}="${qaEl.getAttribute(this.config.attribute)}"]`;
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
    const text = el.textContent?.trim() || '';
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }

  private handleClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (target.closest(this.config.ignoreSelector)) {
      return;
    }
    const selector = this.resolveTarget(target);
    const text = this.getReadableText(target);
    this.push({
      type: 'ui.click',
      category: 'ui.click',
      message: selector,
      level: 'info',
      data: { tag: target.tagName.toLowerCase(), ...(text && { text }), ...(!e.isTrusted && { isTrusted: false }) },
    });
  };

  private handleInput = (e: Event): void => {
    const target = e.target as HTMLInputElement;
    if (target.closest(this.config.ignoreSelector)) {
      return;
    }
    const selector = this.resolveTarget(target);
    const isPassword = target.type === 'password';
    const value = this.config.maskPasswords && isPassword ? '••••••' : target.value;

    if (this.pendingInput?.target === selector) {
      this.pendingInput.value = value;
    } else {
      this.flushPendingInput();
      this.pendingInput = { target: selector, value, element: target, isTrusted: e.isTrusted };
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
    this.push({
      type: 'ui.input',
      category: 'ui.input',
      message: this.pendingInput.target,
      level: 'info',
      data: {
        value: this.pendingInput.value,
        tag: this.pendingInput.element.tagName.toLowerCase(),
        ...(!this.pendingInput.isTrusted && { isTrusted: false }),
      },
    });
    this.pendingInput = null;
    if (this.inputTimer) {
      clearTimeout(this.inputTimer);
      this.inputTimer = null;
    }
  }

  private handleSubmit = (e: Event): void => {
    const form = e.target as HTMLFormElement;
    if (form.closest(this.config.ignoreSelector)) {
      return;
    }
    this.push({
      type: 'ui.submit',
      category: 'ui.submit',
      message: this.resolveTarget(form),
      level: 'info',
      data: {
        action: form.action || undefined,
        method: form.method || 'get',
        ...(!e.isTrusted && { isTrusted: false }),
      },
    });
  };
}
