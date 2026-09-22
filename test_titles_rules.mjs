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

const { TITLES, getTitleById } = await import('./src/titles.js');
const { isDevUser, profileManager } = await import('./src/profile.js');

console.log('--- Testing Titles System ---');

// 1. Verify that all condition-based titles are NOT purchasable
const conditionTitles = TITLES.filter(t => t.hasCondition);
assert(conditionTitles.length >= 7, 'Should have at least 7 condition/achievement titles');

conditionTitles.forEach(t => {
  assert.strictEqual(t.price, 0, `Condition title ${t.id} must have price 0`);
  if (t.id !== 'novice' && t.id !== 'creator') {
    assert(typeof t.checkUnlock === 'function', `Condition title ${t.id} must have checkUnlock function`);
  }
});

// 2. Verify pure shop titles
const shopTitles = TITLES.filter(t => !t.hasCondition && t.price > 0);
assert(shopTitles.length >= 4, 'Should have at least 4 pure shop titles');
shopTitles.forEach(t => {
  assert(t.price > 0, `Shop title ${t.id} must have price > 0`);
  assert.strictEqual(t.hasCondition, false, `Shop title ${t.id} must have hasCondition = false`);
});

// 3. Test buyTitle logic
profileManager.setCoins(1000);
// Attempt to buy condition title (must fail!)
const boughtShark = profileManager.buyTitle('shark');
assert.strictEqual(boughtShark, false, 'Should NOT be able to buy condition title shark');

// Attempt to buy shop title (must succeed!)
const boughtInvestor = profileManager.buyTitle('investor');
assert.strictEqual(boughtInvestor, true, 'Should be able to buy shop title investor');
assert(profileManager.profile.unlockedTitles.includes('investor'), 'investor must be unlocked');

// 4. Test creator grant
profileManager.grantCreatorTitle();
assert(profileManager.profile.unlockedTitles.includes('creator'), 'Creator title must be unlocked after grantCreatorTitle()');
assert.strictEqual(profileManager.profile.title, 'creator', 'Creator title should be equipped');

// 5. Test automatic condition unlock
profileManager.profile.stats.wins = 3;
profileManager.checkAutomaticTitleUnlocks();
assert(profileManager.profile.unlockedTitles.includes('shark'), 'Shark title must automatically unlock at 3 wins');

// 6. Test filter logic for nearest
const { getTitleProgressRatio } = await import('./src/titles.js');
const shark = TITLES.find(t => t.id === 'shark');
const monopolist = TITLES.find(t => t.id === 'monopolist');
const legend = TITLES.find(t => t.id === 'legend');

assert.strictEqual(getTitleProgressRatio(shark, { wins: 3 }, 0), 1.0, 'Shark ratio should be 1.0 at 3 wins');
assert.strictEqual(getTitleProgressRatio(monopolist, { wins: 3 }, 0), 3 / 5, 'Monopolist ratio should be 0.6 at 3 wins');
assert.strictEqual(getTitleProgressRatio(legend, { wins: 3 }, 0), 3 / 25, 'Legend ratio should be 3/25 at 3 wins');

// Verify nearest sorting
const lockedList = [legend, monopolist];
lockedList.sort((a, b) => getTitleProgressRatio(b, { wins: 3 }, 0) - getTitleProgressRatio(a, { wins: 3 }, 0));
assert.strictEqual(lockedList[0].id, 'monopolist', 'Monopolist (60%) should come before Legend (12%) in nearest filter');

console.log('✅ All title system and filter tests passed successfully!');
