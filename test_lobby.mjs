import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple HTTP server for testing
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
      console.log('SERVER 404:', reqPath);
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    }
  });
});

server.listen(3456, async () => {
  console.log('Test server running at http://localhost:3456');

  const errors = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('response', resp => {
    if (resp.status() === 404) console.log('404 URL:', resp.url());
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
      errors.push(msg.text());
    }
  });
  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText);
  });
  page.on('pageerror', err => {
    console.log('BROWSER UNCAUGHT EXCEPTION:', err.message);
    errors.push(err.message);
  });

  try {
    console.log('1. Loading page...');
    await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    console.log('2. Testing Create Room...');
    await page.click('#btn-create-room');
    await page.waitForTimeout(1500);

    const isLobbyActive = await page.$eval('#screen-lobby', el => el.classList.contains('active'));
    console.log('   Is screen-lobby active:', isLobbyActive);
    if (!isLobbyActive) throw new Error('screen-lobby is not active after clicking create room');

    const roomCode = await page.$eval('#lobby-room-code', el => el.innerText.trim());
    console.log('   Generated Room Code:', roomCode);
    if (!roomCode || roomCode === '----') throw new Error('Room code was not generated');

    const copyCodeBtn = await page.$('#btn-copy-code');
    const copyLinkBtn = await page.$('#btn-copy-link');
    console.log('   Copy Code Button exists:', !!copyCodeBtn);
    console.log('   Copy Link Button exists:', !!copyLinkBtn);
    if (!copyCodeBtn || !copyLinkBtn) throw new Error('Copy buttons missing');

    console.log('3. Testing Second Player Join...');
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
    await guestPage.waitForTimeout(600);
    await guestPage.fill('#input-join-code', roomCode);
    await guestPage.click('#form-join-room button[type="submit"]');
    await guestPage.waitForTimeout(1000);

    const isGuestLobbyActive = await guestPage.$eval('#screen-lobby', el => el.classList.contains('active'));
    console.log('   Is guest in lobby:', isGuestLobbyActive);
    if (!isGuestLobbyActive) throw new Error('Guest could not join lobby');

    console.log('4. Testing Kick Player (✕ button)...');
    const kickBtns = await page.$$('.btn-kick-player');
    console.log('   Found kick buttons on host:', kickBtns.length);

    console.log('5. Testing Leave Lobby (Выйти в меню)...');
    await page.click('#btn-leave-lobby');
    await page.waitForTimeout(800);

    const isMenuActive = await page.$eval('#screen-menu', el => el.classList.contains('active'));
    console.log('   Is screen-menu active:', isMenuActive);
    if (!isMenuActive) throw new Error('Did not return to menu screen');

    console.log('6. Testing Re-entering Room (Create Room again without F5)...');
    await page.click('#btn-create-room');
    await page.waitForTimeout(1500);

    const isLobbyActiveAgain = await page.$eval('#screen-lobby', el => el.classList.contains('active'));
    console.log('   Is screen-lobby active again without F5:', isLobbyActiveAgain);
    if (!isLobbyActiveAgain) throw new Error('Could not re-enter lobby after leaving');

    console.log('7. Testing Leave Lobby again...');
    await page.click('#btn-leave-lobby');
    await page.waitForTimeout(800);
    const isMenuAgain = await page.$eval('#screen-menu', el => el.classList.contains('active'));
    console.log('   Is screen-menu active again:', isMenuAgain);

    console.log('\n========================================');
    console.log('ALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
    console.log('Browser errors logged:', errors.length);
    console.log('========================================\n');
  } catch (err) {
    console.error('TEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
