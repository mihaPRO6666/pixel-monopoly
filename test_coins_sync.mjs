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

const PORT = 3488;
server.listen(PORT, async () => {
  console.log(`Test server running at http://localhost:${PORT}`);

  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));

    console.log('Testing coins synchronization & profile viewing...');

    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // 1. Verify header badge is v2.9
    const badgeText = await page.innerText('#btn-open-changelog .changelog-tag');
    console.log('Header badge:', badgeText);
    if (!badgeText.startsWith('v2.')) {
      throw new Error(`Expected v2.x badge, got ${badgeText}`);
    }

    // 2. Open changelog and check v2.9 entry
    await page.evaluate(() => {
      window.app.openChangelogModal();
    });
    await page.waitForSelector('#modal-changelog.active');
    const changelogFirstVer = await page.innerText('#modal-changelog .changelog-ver-pill.current');
    console.log('Changelog current version:', changelogFirstVer);
    if (changelogFirstVer !== 'v2.9') {
      throw new Error(`Expected v2.9 in changelog, got ${changelogFirstVer}`);
    }
    await page.evaluate(() => {
      document.getElementById('modal-changelog')?.classList.remove('active');
    });

    // 3. Test coins display in showPlayerProfileModal for another player
    const testCoinsVal = await page.evaluate(() => {
      const remotePlayer = {
        id: 'remote_player_999',
        name: 'Александр_Топ',
        token: '🎩',
        color: '#e11d48',
        bg: 'neon_night',
        profileBg: 'neon_night',
        coins: 150,
        discordId: 'alex999',
        discordUsername: 'alex_winner',
        isRegistered: true,
        stats: { wins: 3, gamesPlayed: 5, maxNetWorth: 4500 }
      };

      // Register player in leaderboard
      window.leaderboardManager.registerPlayer(remotePlayer);

      // Open their profile modal via app
      window.app.showPlayerProfileModal(remotePlayer);

      const vpCoins = document.getElementById('vp-stat-coins')?.innerText;
      const vpName = document.getElementById('vp-name')?.innerText;
      return { vpCoins, vpName };
    });

    console.log('Remote player profile modal coins result:', testCoinsVal);
    if (!testCoinsVal.vpCoins.includes('150')) {
      throw new Error(`Expected 150 coins in modal, got ${testCoinsVal.vpCoins}`);
    }

    // 4. Test lobby filter: verify test lobbies are excluded
    const lobbyFilterResult = await page.evaluate(() => {
      const mockLobbies = [
        { roomCode: 'TEST-999', hostName: 'Playwright Test', isTest: true },
        { roomCode: 'DEBUG-123', hostName: 'AutoBot', isLocal: true },
        { roomCode: 'REAL-777', hostName: 'Иван_Победа' }
      ];
      window.app.renderLobbiesList(mockLobbies);
      const container = document.getElementById('lobbies-list');
      const text = container ? container.innerText : '';
      return {
        hasTestCode: text.includes('TEST-999'),
        hasDebugCode: text.includes('DEBUG-123'),
        hasRealCode: text.includes('REAL-777')
      };
    });

    console.log('Lobby filter result:', lobbyFilterResult);
    if (lobbyFilterResult.hasTestCode || lobbyFilterResult.hasDebugCode) {
      throw new Error('Test lobbies were not properly filtered out from list!');
    }
    if (!lobbyFilterResult.hasRealCode) {
      throw new Error('Real lobby was unexpectedly filtered out!');
    }

    await browser.close();
    server.close();
    console.log('✅ All tests PASSED successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    server.close();
    process.exit(1);
  }
});
