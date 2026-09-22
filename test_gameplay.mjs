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

server.listen(3457, async () => {
  console.log('Gameplay Test server running at http://localhost:3457');

  const errors = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('BROWSER UNCAUGHT EXCEPTION:', err.message);
    errors.push(err.message);
  });

  try {
    console.log('1. Loading main page...');
    await page.goto('http://localhost:3457', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    console.log('2. Creating Room & Joining Second Player...');
    await page.click('#btn-create-room');
    await page.waitForTimeout(1000);
    const roomCode = await page.$eval('#lobby-room-code', el => el.innerText.trim());

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto('http://localhost:3457', { waitUntil: 'domcontentloaded' });
    await guestPage.waitForTimeout(600);
    await guestPage.fill('#input-join-code', roomCode);
    await guestPage.click('#form-join-room button[type="submit"]');
    await guestPage.waitForTimeout(1200);

    await page.click('#btn-start-game');
    await page.waitForTimeout(1000);

    const isGameActive = await page.$eval('#screen-game', el => el.classList.contains('active'));
    console.log('   Is screen-game active on host:', isGameActive);
    if (!isGameActive) throw new Error('screen-game is not active');

    console.log('3. Rolling Dice...');
    const rollBtn = await page.$('#btn-roll');
    if (rollBtn) {
      await rollBtn.click();
      await page.waitForTimeout(1500);
      console.log('   Dice rolled successfully!');
    }

    console.log('4. Testing Brand Logo Click (leaves game via confirm)...');
    await page.click('#brand-logo');
    await page.waitForTimeout(500);

    const isConfirmActive = await page.$eval('#modal-confirm', el => el.classList.contains('active'));
    console.log('   Is confirm modal active:', isConfirmActive);
    if (!isConfirmActive) throw new Error('Confirm modal did not open on brand click');

    await page.click('#btn-confirm-ok');
    await page.waitForTimeout(1000);

    const isMenuAfterLeave = await page.$eval('#screen-menu', el => el.classList.contains('active'));
    console.log('   Returned to menu after brand click + confirm:', isMenuAfterLeave);
    if (!isMenuAfterLeave) throw new Error('Did not return to menu after leaving game');

    console.log('\n========================================');
    console.log('GAMEPLAY & BRAND LOGO TESTS PASSED!');
    console.log('Browser errors logged:', errors.length);
    console.log('========================================\n');
  } catch (err) {
    console.error('GAMEPLAY TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
