import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// Each test starts from a clean IndexedDB.
beforeEach(() => {
  // fake-indexeddb/auto installs fresh stores on import; clear any cached DB between tests.
  if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
    // best-effort: do nothing, jsdom's fake-indexeddb is reset at module level.
  }
  localStorage.clear();
});

// Minimal crypto.randomUUID polyfill (jsdom ships it in newer versions; keep safe).
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
