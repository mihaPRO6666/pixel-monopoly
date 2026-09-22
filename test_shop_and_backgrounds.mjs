import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    }
  });
});

const PORT = 3462;
server.listen(PORT, async () => {
  console.log(`Test server running at http://localhost:${PORT}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });

  try {
    console.log('--- TEST 1: Shop Modal & Header Coins Button ---');
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('#screen-menu.active');

    // 1. Check Header Shop button
    const shopBtn = page.locator('#btn-open-shop');
    const hasShopBtn = await shopBtn.isVisible();
    console.log('Header Shop button visible:', hasShopBtn);
    if (!hasShopBtn) throw new Error('Header shop button #btn-open-shop not visible');

    const headerCoinsText = await page.locator('#header-coins-display').innerText();
    console.log('Initial header coins display:', headerCoinsText);

    // 2. Open Shop modal
    await shopBtn.click();
    await page.waitForSelector('#modal-shop.active');
    const shopBalance = await page.locator('#shop-balance-val').innerText();
    console.log('Shop modal balance text:', shopBalance);

    // Close shop modal
    await page.click('#modal-shop [data-close-modal]');
    await page.waitForSelector('#modal-shop', { state: 'hidden' });

    console.log('--- TEST 2: Coins Reward on Game Victory (+50) and Participation (0) ---');
    // Simulate non-win match -> coins should remain 0
    await page.evaluate(() => {
      window.profileManager.recordGameResult(false, 500, 1000);
      window.app.renderProfileCard();
    });
    const coinsAfterLoss = await page.locator('#header-coins-display').innerText();
    console.log('Header coins after loss/participation:', coinsAfterLoss);
    if (coinsAfterLoss !== '0') {
      throw new Error(`Expected 0 coins after loss, got: ${coinsAfterLoss}`);
    }

    // Simulate victory -> +50 coins
    await page.evaluate(() => {
      window.profileManager.recordGameResult(true, 1500, 3000);
      window.app.renderProfileCard();
    });

    const updatedCoins = await page.locator('#header-coins-display').innerText();
    console.log('Header coins after victory:', updatedCoins);
    if (updatedCoins !== '50') {
      throw new Error(`Expected header coins to be 50, got: ${updatedCoins}`);
    }

    const cardCoins = await page.locator('#stat-coins').innerText();
    console.log('Profile card coins after victory:', cardCoins);
    if (cardCoins !== '50') {
      throw new Error(`Expected profile card coins to be 50, got: ${cardCoins}`);
    }

    // Check shop balance after victory
    await shopBtn.click();
    await page.waitForSelector('#modal-shop.active');
    const newShopBalance = await page.locator('#shop-balance-val').innerText();
    console.log('Shop modal balance after win:', newShopBalance);
    if (newShopBalance !== '50') {
      throw new Error(`Expected shop balance to be 50, got: ${newShopBalance}`);
    }
    await page.click('#modal-shop [data-close-modal]');
    await page.waitForSelector('#modal-shop', { state: 'hidden' });

    console.log('--- TEST 3: Profile Background Picker & Styling ---');
    // Open profile modal
    await page.click('#btn-edit-profile-trigger');
    await page.waitForSelector('#modal-profile.active');

    // Verify background picker items count
    const bgItemsCount = await page.locator('.bg-picker-item').count();
    console.log('Background picker items count:', bgItemsCount);
    if (bgItemsCount < 8) {
      throw new Error(`Expected at least 8 background options, found ${bgItemsCount}`);
    }

    // Select 'cyberpunk' background
    await page.click('.bg-picker-item[data-bg-id="cyberpunk"]');
    const isCyberpunkActive = await page.locator('.bg-picker-item[data-bg-id="cyberpunk"]').evaluate(el => el.classList.contains('active'));
    console.log('Cyberpunk bg item is active:', isCyberpunkActive);
    if (!isCyberpunkActive) {
      throw new Error('Expected cyberpunk background item to be active');
    }

    // Save profile modal
    await page.click('#form-profile button[type="submit"]');
    await page.waitForSelector('#modal-profile', { state: 'hidden' });

    // Verify profileManager has bg 'cyberpunk'
    const currentProfileBg = await page.evaluate(() => window.profileManager.profile.bg);
    console.log('ProfileManager current bg:', currentProfileBg);
    if (currentProfileBg !== 'cyberpunk') {
      throw new Error(`Expected profile bg to be 'cyberpunk', got: ${currentProfileBg}`);
    }

    console.log('--- TEST 4: View Player Profile Modal with Custom Background & Ranks ---');
    await page.click('#profile-card-name');
    await page.waitForSelector('#modal-view-player-profile.active');

    const vpCoins = await page.locator('#vp-stat-coins').innerText();
    console.log('View profile modal coins:', vpCoins);
    if (vpCoins !== '50') {
      throw new Error(`Expected view profile coins to be 50, got: ${vpCoins}`);
    }

    const hasCustomHeaderBg = await page.locator('.view-profile-header').evaluate(el => {
      return el.style.background.includes('gradient');
    });
    console.log('View profile header has gradient background:', hasCustomHeaderBg);
    if (!hasCustomHeaderBg) {
      throw new Error('Expected view-profile-header to have gradient background from cyberpunk theme');
    }

    const vpRankWins = await page.locator('#vp-rank-wins').innerText();
    const vpRankMatches = await page.locator('#vp-rank-matches').innerText();
    console.log('View profile ranks:', { vpRankWins, vpRankMatches });

    await page.click('#modal-view-player-profile [data-close-modal]');
    await page.waitForSelector('#modal-view-player-profile', { state: 'hidden' });

    console.log('\n========================================');
    console.log('ALL SHOP, COINS, BACKGROUNDS & RANKS TESTS PASSED!');
    console.log('========================================\n');

  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
