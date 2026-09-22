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

const PORT = 3492;
server.listen(PORT, async () => {
  console.log(`Test server running at http://localhost:${PORT}`);

  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));

    console.log('--- Testing v3.0 Dice Case & Clean Stat Labels ---');

    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // 1. Verify header badge is v3.x
    const badgeText = await page.innerText('#btn-open-changelog .changelog-tag');
    console.log('Header badge:', badgeText);
    if (!badgeText.startsWith('v3.')) {
      throw new Error(`Expected v3.x badge, got ${badgeText}`);
    }

    // 2. Verify word "Монет" is removed from profile card
    const cardStatLabels = await page.$$eval('.profile-card .stat-label', els => els.map(e => e.innerText.trim()));
    console.log('Profile card stat labels:', cardStatLabels);
    if (cardStatLabels.some(l => l.includes('Монет') || l.includes('МОНЕТ'))) {
      throw new Error('Word "Монет" still found in profile card stat labels!');
    }

    // 3. Open Shop Modal
    await page.click('#btn-open-shop');
    await page.waitForSelector('#modal-shop.active');
    console.log('✓ Shop modal opened');

    // Verify odds pills are distinct: 50%, 30%, 15%, 5%
    const oddsTexts = await page.$$eval('.shop-odd-pill', els => els.map(e => e.innerText.trim()));
    console.log('Shop odds pills:', oddsTexts);
    if (!oddsTexts.some(o => o.includes('50%')) || !oddsTexts.some(o => o.includes('30%'))) {
      throw new Error('Odds pills do not reflect updated 50% / 30% values!');
    }

    // 4. Verify Dice Collection has 8 items
    const diceCardsCount = await page.$$eval('.shop-dice-card', els => els.length);
    console.log('Dice collection items count:', diceCardsCount);
    if (diceCardsCount !== 8) {
      throw new Error(`Expected 8 dice items, got ${diceCardsCount}`);
    }

    // 5. Test Case Opening with coins
    // Give 100 coins
    await page.evaluate(() => {
      window.profileManager.addCoins(100);
      window.app.renderShopModal();
    });

    const balanceText = await page.innerText('#shop-balance-val');
    console.log('Shop balance:', balanceText);

    // Click Open Case button
    await page.click('#btn-open-dice-case');
    await page.waitForSelector('#modal-case-roulette.active');
    console.log('✓ Case opening roulette modal active and spinning');

    // Wait for win state to appear (roulette animation takes ~4.8s)
    await page.waitForSelector('#roulette-win-container', { state: 'visible', timeout: 8000 });
    const wonName = await page.innerText('#roulette-win-name');
    console.log('✓ Won dice skin:', wonName);

    // Click Equip Won Dice
    await page.click('#btn-equip-won-dice');
    await page.waitForSelector('#modal-case-roulette', { state: 'hidden' });
    console.log('✓ Won dice equipped');

    // 6. Verify profile now has the equipped dice
    const currentDice = await page.evaluate(() => window.profileManager.profile.diceSkin);
    console.log('Current equipped dice skin ID:', currentDice);
    if (!currentDice) {
      throw new Error('Dice skin was not equipped!');
    }

    await browser.close();
    server.close();
    console.log('🎉 ALL DICE CASE & CLEAN STATS TESTS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    server.close();
    process.exit(1);
  }
});
