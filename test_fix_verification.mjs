import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(process.cwd(), reqPath);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(0, async () => {
  const PORT = server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));
    page.on('pageerror', err => {
      console.error('BROWSER ERROR:', err);
      throw err;
    });

    // Simulate dev user "hizuhara."
    await page.addInitScript(() => {
      localStorage.setItem('monopoly_player_profile', JSON.stringify({
        id: 'discord_hizuhara',
        name: 'hizuhara.',
        username: 'hizuhara.',
        discordId: 'hizuhara.',
        isRegistered: true,
        token: 'tophat',
        bg: 'cyberpunk',
        profileBg: 'cyberpunk',
        coins: 1000,
        stats: { gamesPlayed: 10, wins: 8 }
      }));
    });

    await page.goto(`http://localhost:${PORT}/index.html`);
    await page.waitForTimeout(1000);

    // 1. Test Shop Modal
    console.log('1. Testing Shop button...');
    await page.click('#btn-open-shop', { force: true });
    await page.waitForTimeout(300);
    const shopActive = await page.$eval('#modal-shop', el => el.classList.contains('active'));
    const clActiveWhenShopOpened = await page.$eval('#modal-changelog', el => el.classList.contains('active'));
    console.log('Shop active:', shopActive, '| Changelog active:', clActiveWhenShopOpened);
    if (!shopActive) throw new Error('Shop modal failed to open');
    if (clActiveWhenShopOpened) throw new Error('Changelog modal should NOT be open when opening shop!');
    console.log('✓ Shop opened exclusively without opening changelog!');
    await page.evaluate(() => window.closeModalById('modal-shop'));
    await page.waitForTimeout(200);

    // 2. Test Changelog Modal
    console.log('2. Testing Changelog button...');
    await page.click('#btn-open-changelog', { force: true });
    await page.waitForTimeout(300);
    const clActive = await page.$eval('#modal-changelog', el => el.classList.contains('active'));
    const shopActiveWhenClOpened = await page.$eval('#modal-shop', el => el.classList.contains('active'));
    console.log('Changelog active:', clActive, '| Shop active:', shopActiveWhenClOpened);
    if (!clActive) throw new Error('Changelog modal failed to open');
    if (shopActiveWhenClOpened) throw new Error('Shop modal should NOT be open when opening changelog!');
    console.log('✓ Changelog opened exclusively without opening shop!');
    await page.evaluate(() => window.closeModalById('modal-changelog'));
    await page.waitForTimeout(200);

    // 3. Test Settings Modal
    console.log('3. Testing Settings button...');
    await page.click('#btn-open-settings', { force: true });
    await page.waitForTimeout(300);
    const stActive = await page.$eval('#modal-settings', el => el.classList.contains('active'));
    console.log('Settings active:', stActive);
    if (!stActive) throw new Error('Settings modal failed to open');
    console.log('✓ Settings opened successfully!');
    await page.evaluate(() => window.closeModalById('modal-settings'));
    await page.waitForTimeout(200);

    // 4. Test Solo Game & Verify Bot Tokens (no literal 'tophat' or 'moneybag')
    console.log('4. Testing Solo Game Tokens Rendering...');
    await page.click('#btn-create-solo-room', { force: true });
    await page.waitForTimeout(500);

    // Check lobby tokens
    const lobbyHtml = await page.innerText('#lobby-players-list');
    console.log('Lobby text content preview:', lobbyHtml.replace(/\n/g, ' '));
    if (lobbyHtml.includes('tophat') || lobbyHtml.includes('moneybag')) {
      throw new Error('Lobby contains raw token identifiers instead of emojis/names!');
    }
    console.log('✓ Lobby slots render properly formatted tokens/emojis');

    // Start game
    await page.click('#btn-start-game', { force: true });
    await page.waitForTimeout(1000);

    const sidebarText = await page.innerText('#sidebar-players');
    console.log('Sidebar text content:', sidebarText.replace(/\n/g, ' '));
    if (sidebarText.includes('tophat') || sidebarText.includes('moneybag')) {
      throw new Error('Sidebar player cards contain raw token identifiers instead of emojis!');
    }
    console.log('✓ In-game sidebar player cards render clean emojis without raw string text!');

    console.log('\n========================================');
    console.log('🎉 ALL ISSUES FULLY FIXED & VERIFIED!');
    console.log('========================================');

    await browser.close();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err);
    if (browser) await browser.close();
    server.close();
    process.exit(1);
  }
});
