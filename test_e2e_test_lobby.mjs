import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const PORT = 3495;
const DIR = process.cwd();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(DIR, reqPath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    // 1. Test Regular Guest: dev button should be hidden
    const pageGuest = await browser.newPage();
    await pageGuest.goto(`http://localhost:${PORT}`);
    await pageGuest.waitForTimeout(600);

    const guestDevBtnVisible = await pageGuest.evaluate(() => {
      const btn = document.getElementById('btn-create-test-room');
      return btn && btn.style.display !== 'none' && window.getComputedStyle(btn).display !== 'none';
    });
    console.log('Guest user dev button visible:', guestDevBtnVisible);
    if (guestDevBtnVisible) throw new Error('Dev button must be hidden for guest users');

    // 2. Test Developer (hizuhara.): dev button should be visible with text "🧪 Тест"
    const pageDev = await browser.newPage();
    await pageDev.addInitScript(() => {
      localStorage.setItem('monopoly_player_profile', JSON.stringify({
        id: 'dev_user_1',
        name: 'hizuhara',
        discordUsername: 'hizuhara.',
        token: '💎',
        color: '#2563eb',
        bg: 'cyberpunk',
        coins: 100,
        isRegistered: true,
        stats: { gamesPlayed: 5, wins: 3, losses: 2, totalEarned: 10000, maxNetWorth: 5000 }
      }));
    });

    await pageDev.goto(`http://localhost:${PORT}`);
    await pageDev.waitForTimeout(600);

    const devBtnData = await pageDev.evaluate(() => {
      const btn = document.getElementById('btn-create-test-room');
      return {
        visible: btn && btn.style.display !== 'none' && window.getComputedStyle(btn).display !== 'none',
        text: btn ? btn.innerText.trim() : ''
      };
    });
    console.log('Developer user dev button:', devBtnData);
    if (!devBtnData.visible) throw new Error('Dev button must be visible for developer hizuhara.');
    if (devBtnData.text !== '🧪') throw new Error(`Button text should be strictly icon '🧪', got: '${devBtnData.text}'`);

    // 3. Click Test Room Button and check lobby screen & banners
    await pageDev.click('#btn-create-test-room');
    await pageDev.waitForTimeout(500);

    const lobbyInfo = await pageDev.evaluate(() => {
      const code = document.getElementById('lobby-room-code')?.innerText;
      const bannerDisplay = document.getElementById('lobby-test-banner')?.style.display;
      return { code, bannerDisplay };
    });
    console.log('Lobby info:', lobbyInfo);
    if (!lobbyInfo.code.startsWith('TEST-')) throw new Error('Test room code must start with TEST-');
    if (lobbyInfo.bannerDisplay === 'none') throw new Error('Lobby test banner must be displayed');

    // 4. Test Solo Game Start (1 player only)
    await pageDev.click('#btn-start-game');
    await pageDev.waitForTimeout(800);

    const gameState = await pageDev.evaluate(() => {
      const gameScreen = document.getElementById('screen-game');
      const isGameActive = gameScreen && gameScreen.classList.contains('active');
      const rollBtn = document.getElementById('btn-roll-card');
      const testBanner = document.getElementById('game-test-banner')?.style.display;
      return { isGameActive, rollBtnVisible: Boolean(rollBtn), testBanner };
    });
    console.log('Solo game state:', gameState);
    if (!gameState.isGameActive) throw new Error('Game must be active when started solo in test mode');
    if (gameState.testBanner === 'none') throw new Error('Game test banner must be visible');

    // 5. Test rolling dice in solo mode
    await pageDev.click('#btn-roll-card');
    await pageDev.waitForTimeout(2000);

    const rolled = await pageDev.evaluate(() => {
      const die1 = document.getElementById('die-1')?.innerText;
      const die2 = document.getElementById('die-2')?.innerText;
      const endTurnBtn = document.getElementById('btn-end-turn-card');
      return { die1, die2, canEndTurn: Boolean(endTurnBtn) };
    });
    console.log('Dice rolled solo:', rolled);
    if (!rolled.die1 || !rolled.die2) throw new Error('Dice should have values after roll');

    console.log('✓ All developer solo test checks passed successfully!');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
    process.exit(0);
  }
});
