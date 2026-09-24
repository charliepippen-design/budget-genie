// Mock localStorage for Vitest Node environment
const storage: Record<string, string> = {};

global.localStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = String(value); },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
  key: (index: number) => Object.keys(storage)[index] ?? null,
  length: 0,
};
Object.defineProperty(global.localStorage, 'length', {
  get: () => Object.keys(storage).length,
});
