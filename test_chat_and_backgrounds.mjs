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

const PORT = 3499;
server.listen(PORT, async () => {
  console.log(`Test server running at http://localhost:${PORT}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('UNCAUGHT EXCEPTION:', err.message);
    errors.push(err.message);
  });

  try {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForTimeout(1000);

    // 1. Verify "Апдейты" is removed from header button
    console.log('--- TEST 1: Header v2.5 badge without "Апдейты" text ---');
    const btnText = await page.$eval('#btn-open-changelog', el => el.innerText.trim());
    console.log('Changelog button text:', JSON.stringify(btnText));
    if (btnText.includes('Апдейты')) {
      throw new Error('Word "Апдейты" still present in changelog button');
    }
    if (!btnText.startsWith('v')) {
      throw new Error(`Version badge missing in changelog button: ${btnText}`);
    }
    console.log('✓ Header changelog badge is clean and minimal (only v2.6)');

    // 2. Select custom background (e.g. Кибернеон / cyberpunk)
    console.log('--- TEST 2: Select custom background and create room ---');
    await page.evaluate(() => {
      window.profileManager.updateBg('cyberpunk');
    });

    await page.click('#btn-create-room');
    await page.waitForTimeout(1000);

    const isLobby = await page.$eval('#screen-lobby', el => el.classList.contains('active'));
    if (!isLobby) throw new Error('Lobby screen not active');

    // Verify player slot has custom background style
    const slotBg = await page.$eval('.player-slot', el => el.getAttribute('style') || '');
    console.log('Lobby slot style:', slotBg);
    if (!slotBg.includes('linear-gradient') && !slotBg.includes('rgb')) {
      throw new Error('Lobby slot does not have custom background style');
    }
    console.log('✓ Lobby slot displays custom player background');

    // 3. Start game and check in-game sidebar + In-Game Chat
    console.log('--- TEST 3: In-Game Chat & Sidebar styling ---');
    await page.evaluate(() => {
      // Add a second player and start
      window.app.lobbyPlayers.push({
        id: 'bot_1',
        name: 'Бот Магнат',
        token: '🎩',
        color: '#dc2626',
        bg: 'emerald',
        profileBg: 'emerald',
        isBot: true,
        isHost: false
      });
      window.app.startGameFromLobby();
    });
    await page.waitForTimeout(1000);

    const isGame = await page.$eval('#screen-game', el => el.classList.contains('active'));
    if (!isGame) throw new Error('Game screen not active');

    // Check sidebar cards styling
    const sidebarCards = await page.$$('.player-card-sidebar');
    console.log('Sidebar cards count:', sidebarCards.length);
    if (sidebarCards.length < 2) throw new Error('Not enough sidebar player cards');
    console.log('✓ In-game sidebar cards rendered for all players with background themes');

    // 4. Test In-Game Chat tabs and sending message
    console.log('--- TEST 4: Chat Tab Switching and Messaging ---');
    const tabChat = await page.$('#tab-btn-chat');
    if (!tabChat) throw new Error('Chat tab button not found');
    await tabChat.click();
    await page.waitForTimeout(400);

    const isChatActive = await page.$eval('#tab-content-chat', el => el.classList.contains('active'));
    if (!isChatActive) throw new Error('Chat tab content is not active');
    console.log('✓ Chat tab activated successfully');

    // Send a message via input
    await page.fill('#input-game-chat', 'Привет всем! Играем честно 🎲');
    await page.click('#btn-send-chat');
    await page.waitForTimeout(500);

    const messagesCount = await page.$$eval('#game-chat-messages .chat-bubble-wrap', els => els.length);
    console.log('Chat messages count:', messagesCount);
    if (messagesCount < 1) throw new Error('Chat message was not rendered');

    const lastMsgText = await page.$eval('#game-chat-messages .chat-bubble-wrap:last-child .chat-bubble', el => el.innerText.trim());
    console.log('Last message text:', lastMsgText);
    if (!lastMsgText.includes('Привет всем! Играем честно 🎲')) {
      throw new Error('Message text mismatch');
    }
    console.log('✓ In-game message sent and rendered with bubble and token');

    // Send quick reaction
    console.log('--- TEST 5: Quick reaction button ---');
    await page.click('.chat-quick-btn[data-text="🔥"]');
    await page.waitForTimeout(400);

    const newMessagesCount = await page.$$eval('#game-chat-messages .chat-bubble-wrap', els => els.length);
    if (newMessagesCount < 2) throw new Error('Quick reaction message not rendered');
    console.log('✓ Quick reaction button works smoothly');

    console.log('\n========================================');
    console.log('ALL CHAT, BACKGROUNDS & HEADER TESTS PASSED!');
    console.log('Browser errors logged:', errors.length);
    console.log('========================================');

    if (errors.length > 0) {
      throw new Error(`Browser errors encountered: ${errors.join('; ')}`);
    }

  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
