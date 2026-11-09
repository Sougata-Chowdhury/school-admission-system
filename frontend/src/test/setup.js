import '@testing-library/jest-dom';

// Node 26 exposes an experimental global `localStorage` that is undefined unless
// started with --localstorage-file, and it can shadow jsdom's implementation in
// older Vitest versions. Provide a small in-memory implementation for tests.
try {
  if (!window.localStorage) {
    throw new Error('localStorage is unavailable');
  }
} catch {
  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
  });
}
