# Testing

## Stack

- Test runner: built-in [`node:test`](https://nodejs.org/api/test.html) + [`tsx`](https://github.com/privatenumber/tsx) for TypeScript loading
- Assertions: `node:assert/strict`
- No `vitest`, `jest`, or other test frameworks

## Run

```bash
yarn test
```

Equivalent to: `node --import tsx --test src/core/llm/__tests__/*.test.ts`

## Layout

- Tests live next to the code they cover: `src/**/__tests__/*.test.ts`
- One test file per module (e.g. `roles.ts` → `__tests__/roles.test.ts`)

## Style

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn } from '../module';

test('does the thing', () => {
  assert.equal(fn(1), 2);
});
```

## Rationale

- Minimum dependencies — `tsx` is the only devDep needed for TS support
- Native ESM, no config files, no transformer setup
- Fast startup (~250ms for 20 tests)
