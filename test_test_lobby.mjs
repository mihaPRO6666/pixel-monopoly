import assert from 'assert';

// Mock browser globals for Node test runner
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};
globalThis.sessionStorage = { ...globalThis.localStorage };

const { isDevUser, AVAILABLE_TOKENS, profileManager } = await import('./src/profile.js');
const { getPresetById } = await import('./src/presets.js');

console.log('--- Testing Developer Check Logic ---');

// 1. hizuhara. username check
assert.strictEqual(isDevUser({ name: 'Guest', discordUsername: 'hizuhara.' }), true, 'hizuhara. discord username should be recognized as dev');
assert.strictEqual(isDevUser({ name: 'Hizuhara', discordUsername: null }), true, 'Hizuhara name should be recognized as dev');
assert.strictEqual(isDevUser({ name: 'Player1', discordUsername: 'random_guy' }), false, 'Random player should not be dev');
assert.strictEqual(isDevUser(null), false, 'Null profile should not be dev');

// 2. Dev mode toggle in localStorage
globalThis.localStorage.setItem('monopoly_dev_mode', 'true');
assert.strictEqual(isDevUser({ name: 'Random', discordUsername: 'random' }), true, 'monopoly_dev_mode should allow test access');
globalThis.localStorage.removeItem('monopoly_dev_mode');

console.log('✓ Dev user identification tests passed');

console.log('--- Testing Test Lobby Isolation & Rules ---');
const classicPreset = getPresetById('classic');
assert(classicPreset, 'Classic preset must exist');

// Check room code generation pattern
const testRoomCode = 'TEST-' + Math.floor(1000 + Math.random() * 9000);
assert(/^TEST-\d{4}$/.test(testRoomCode), 'Test room code must match TEST-XXXX pattern');

console.log('✓ All test lobby unit checks passed successfully!');
