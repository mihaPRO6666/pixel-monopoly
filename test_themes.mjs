import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(process.cwd(), reqPath);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(3355, async () => {
  console.log('Testing themes on http://localhost:3355...');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  }
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:3355');
    await page.waitForTimeout(600);
    console.log('✓ Page loaded');

    // 1. Open Theme Selector Modal
    await page.click('#btn-theme-toggle');
    await page.waitForTimeout(400);

    const modal = await page.$('#modal-theme-selector.active');
    if (!modal) throw new Error('Theme selector modal did not open');
    console.log('✓ Theme selector modal opened');

    // 2. Verify all 16 themes are present in the modal
    const themeCards = await page.$$('.theme-card-option');
    console.log(`✓ Total themes in selector: ${themeCards.length}`);
    if (themeCards.length !== 16) {
      throw new Error(`Expected 16 themes, got ${themeCards.length}`);
    }

    const expectedThemeIds = [
      'mint', 'coral', 'ocean', 'dusk', 'purple', 'sunset', 'emerald', 'gold',
      'cyberpunk', 'midnight', 'cherry', 'lavender', 'coffee', 'nordic', 'crimson', 'solar'
    ];

    for (const themeId of expectedThemeIds) {
      const card = await page.$(`.theme-card-option[data-theme-id="${themeId}"]`);
      if (!card) throw new Error(`Theme card ${themeId} not found in modal`);
    }
    console.log('✓ All 16 theme cards verified in modal');

    // 3. Test selecting newly added themes (e.g. cyberpunk, midnight, cherry, coffee, nordic)
    const testThemes = ['cyberpunk', 'midnight', 'cherry', 'coffee', 'nordic', 'solar', 'lavender', 'crimson'];
    for (const tid of testThemes) {
      // Reopen modal if closed
      const isModalOpen = await page.$('#modal-theme-selector.active');
      if (!isModalOpen) {
        await page.click('#btn-theme-toggle');
        await page.waitForTimeout(300);
      }

      await page.click(`.theme-card-option[data-theme-id="${tid}"]`);
      await page.waitForTimeout(300);

      const currentApplied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (currentApplied !== tid) {
        throw new Error(`Theme not applied: expected ${tid}, got ${currentApplied}`);
      }

      // Check computed primary color is defined
      const primaryColor = await page.evaluate(() => {
        return getComputedStyle(document.documentElement).getPropertyValue('--md-primary').trim();
      });
      if (!primaryColor) {
        throw new Error(`--md-primary is empty for theme ${tid}`);
      }
      console.log(`✓ Applied theme "${tid}" -> --md-primary: ${primaryColor}`);
    }

    // 4. Test Persistence on reload
    await page.reload();
    await page.waitForTimeout(600);
    const persistedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    console.log(`✓ Persisted theme after reload: ${persistedTheme}`);
    if (persistedTheme !== 'crimson') {
      throw new Error(`Expected persisted theme 'crimson', got '${persistedTheme}'`);
    }

    console.log('\n🎉 ALL THEMES VERIFIED AND WORKING PERFECTLY! 🎉');
  } catch (err) {
    console.error('Theme test failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
