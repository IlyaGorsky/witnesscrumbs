import { Interceptor, PushFn } from "./types";

export class StorageInterceptor implements Interceptor {
  private push: PushFn = () => {};
  private originalSetItem: typeof Storage.prototype.setItem | null = null;
  private originalRemoveItem: typeof Storage.prototype.removeItem | null = null;
  private originalClear: typeof Storage.prototype.clear | null = null;

  start(push: PushFn): void {
    this.push = push;
    const self = this;

    try {
      this.originalSetItem = Storage.prototype.setItem;
      this.originalRemoveItem = Storage.prototype.removeItem;
      this.originalClear = Storage.prototype.clear;

      Storage.prototype.setItem = function (key: string, value: string) {
        self.originalSetItem!.call(this, key, value);
        if (this === localStorage) {
          self.push({
            type: 'default',
            category: 'storage',
            message: `LS set "${key}"`,
            level: 'info',
            data: { op: 'set', key },
          });
        }
      };

      Storage.prototype.removeItem = function (key: string) {
        self.originalRemoveItem!.call(this, key);
        if (this === localStorage) {
          self.push({
            type: 'default',
            category: 'storage',
            message: `LS remove "${key}"`,
            level: 'info',
            data: { op: 'remove', key },
          });
        }
      };

      Storage.prototype.clear = function () {
        const isLocal = this === localStorage;
        self.originalClear!.call(this);
        if (isLocal) {
          self.push({
            type: 'default',
            category: 'storage',
            message: 'LS clear',
            level: 'warning',
            data: { op: 'clear' },
          });
        }
      };
    } catch {
      // localStorage not available
    }
  }

  stop(): void {
    if (this.originalSetItem) {
      Storage.prototype.setItem = this.originalSetItem;
      this.originalSetItem = null;
    }
    if (this.originalRemoveItem) {
      Storage.prototype.removeItem = this.originalRemoveItem;
      this.originalRemoveItem = null;
    }
    if (this.originalClear) {
      Storage.prototype.clear = this.originalClear;
      this.originalClear = null;
    }
    this.push = () => {};
  }
}
