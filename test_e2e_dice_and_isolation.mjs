import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const PORT = 3496;
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
  console.log(`Test server running at http://localhost:${PORT}`);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    const page = await browser.newPage();
    const initialStats = { gamesPlayed: 5, wins: 3, losses: 2, totalEarned: 10000, maxNetWorth: 5000 };
    const initialCoins = 100;

    await page.addInitScript(({ stats, coins }) => {
      localStorage.setItem('monopoly_player_profile', JSON.stringify({
        id: 'dev_user_1',
        name: 'hizuhara',
        discordUsername: 'hizuhara.',
        token: '💎',
        color: '#2563eb',
        bg: 'cyberpunk',
        coins: coins,
        isRegistered: true,
        stats: stats
      }));
    }, { stats: initialStats, coins: initialCoins });

    await page.goto(`http://localhost:${PORT}`);
    await page.waitForTimeout(600);

    // 1. Verify header badge is v3.9
    const headerBadgeText = await page.innerText('#btn-open-changelog');
    console.log('Header badge text:', headerBadgeText.trim());
    if (headerBadgeText.trim() !== 'v3.9') throw new Error(`Expected v3.9 in header badge, got: ${headerBadgeText}`);

    // 2. Open test room (icon-only button)
    await page.click('#btn-create-test-room');
    await page.waitForTimeout(500);

    const hasJackpotToggle = await page.evaluate(() => Boolean(document.getElementById('toggle-jackpot')));
    console.log('Jackpot toggle present:', hasJackpotToggle);
    if (hasJackpotToggle) throw new Error('toggle-jackpot must be removed from the DOM');

    const toastText = await page.evaluate(() => {
      const toast = document.querySelector('.toast, .md-toast, #toast-container');
      return toast ? toast.innerText : '';
    });
    console.log('Creation toast captured:', toastText);

    // 3. Start Solo Game
    await page.click('#btn-start-game');
    await page.waitForTimeout(800);

    // 4. Test Dice Roll Animation
    await page.click('#btn-roll-card');
    
    // Check rolling classes during active animation
    await page.waitForTimeout(100);
    const isRollingActive = await page.evaluate(() => {
      const d1 = document.getElementById('die-1');
      const d2 = document.getElementById('die-2');
      return d1.classList.contains('rolling') && d2.classList.contains('rolling');
    });
    console.log('Dice rolling animation active:', isRollingActive);
    if (!isRollingActive) throw new Error('Dice should have rolling class during animation');

    // Wait for roll completion and impact animation
    await page.waitForTimeout(1500);
    const rollResult = await page.evaluate(() => {
      const d1 = document.getElementById('die-1')?.innerText;
      const d2 = document.getElementById('die-2')?.innerText;
      return { d1, d2 };
    });
    console.log('Dice landed with values:', rollResult);
    if (!rollResult.d1 || !rollResult.d2) throw new Error('Dice must have final values');

    // 5. Verify that profile coins and stats did not change
    const afterProfile = await page.evaluate(() => {
      const raw = localStorage.getItem('monopoly_player_profile');
      return JSON.parse(raw);
    });

    console.log('Coins after test roll:', afterProfile.coins);
    console.log('Stats after test roll:', afterProfile.stats);
    if (afterProfile.coins !== initialCoins) throw new Error('Coins must not change in test mode');
    if (afterProfile.stats.wins !== initialStats.wins) throw new Error('Wins must not change in test mode');

    console.log('✓ All 3D dice physics & test lobby leaderboard isolation checks passed successfully!');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
    process.exit(0);
  }
});
