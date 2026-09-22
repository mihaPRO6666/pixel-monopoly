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

const PORT = 3459;
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
    console.log('--- TEST 1: Guest profile and Leaderboard guest banner ---');
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('#screen-menu.active');

    // Clear local storage to ensure fresh guest state
    await page.evaluate(() => {
      localStorage.clear();
      window.location.reload();
    });
    await page.waitForSelector('#screen-menu.active');

    // 1. Check guest status badge and single header Discord button
    const statusBadgeText = await page.locator('#profile-status-badge').innerText();
    console.log('Profile status badge:', statusBadgeText);
    if (!statusBadgeText.includes('Не авторизован')) {
      throw new Error(`Expected 'Не авторизован' badge, got: ${statusBadgeText}`);
    }

    const cardNameText = await page.locator('#profile-card-name').innerText();
    console.log('Profile card name:', cardNameText);
    if (cardNameText !== 'Гость') {
      throw new Error(`Expected card name 'Гость', got: ${cardNameText}`);
    }

    // Header buttons check: Discord login button visible, profile button hidden
    const isHeaderDiscordVisible = await page.locator('#btn-header-discord').isVisible();
    const isHeaderProfileVisible = await page.locator('#btn-open-profile').isVisible();
    console.log('Header Discord button visible:', isHeaderDiscordVisible);
    console.log('Header Profile button visible:', isHeaderProfileVisible);
    if (!isHeaderDiscordVisible || isHeaderProfileVisible) {
      throw new Error('For guests, only #btn-header-discord should be visible in header');
    }

    // 2. Check that Leaderboard has the Discord guest warning banner
    const hasGuestBanner = await page.locator('.lb-guest-banner').isVisible();
    console.log('Has guest banner in leaderboard:', hasGuestBanner);
    if (!hasGuestBanner) {
      throw new Error('Expected .lb-guest-banner to be visible for guest');
    }

    // 3. Check that guest is NOT listed in the rankings
    const rankingsCount = await page.locator('.leaderboard-item').count();
    console.log('Guest leaderboard rankings count:', rankingsCount);
    if (rankingsCount !== 0) {
      throw new Error(`Expected 0 registered players in fresh leaderboard, found ${rankingsCount}`);
    }

    // 4. Open Profile Modal as guest -> verify nickname input is disabled
    await page.click('#btn-edit-profile-trigger');
    await page.waitForSelector('#modal-profile.active');
    const isNameDisabled = await page.locator('#input-profile-name').isDisabled();
    console.log('Profile name input is disabled for guest:', isNameDisabled);
    if (!isNameDisabled) {
      throw new Error('Expected #input-profile-name to be disabled for guest');
    }
    await page.click('#modal-profile [data-close-modal]');

    console.log('--- TEST 2: Discord Authentication and Leaderboard Entry ---');
    // Open Discord modal via header button
    await page.click('#btn-header-discord');
    await page.waitForSelector('#modal-discord-auth.active');

    // Verify Quick verification option is COMPLETELY REMOVED
    const hasQuickLogin = await page.locator('#btn-quick-discord-login').count();
    const hasQuickInput = await page.locator('#input-quick-discord-username').count();
    console.log('Quick login buttons count:', hasQuickLogin, 'inputs count:', hasQuickInput);
    if (hasQuickLogin > 0 || hasQuickInput > 0) {
      throw new Error('Quick login option should be completely removed from DOM');
    }

    // Verify OAuth button is present
    const hasOAuthBtn = await page.locator('#btn-start-discord-oauth').isVisible();
    console.log('Has Discord OAuth button:', hasOAuthBtn);
    if (!hasOAuthBtn) {
      throw new Error('Expected #btn-start-discord-oauth to be visible');
    }

    // Close modal
    await page.click('#modal-discord-auth [data-close-modal]');

    // Simulate authenticated Discord user
    await page.evaluate(() => {
      window.profileManager.setDiscordUser({
        id: 'discord_777777777777777777',
        discordId: '777777777777777777',
        name: 'PlayerTester#8888',
        username: 'PlayerTester#8888',
        avatarUrl: null,
        isRegistered: true,
        authProvider: 'discord'
      });
      window.leaderboardManager.syncMyRegisteredRecord();
      window.app.renderProfileCard();
      window.app.renderLeaderboard();
    });

    // Verify header switched: Discord login button hidden, profile button visible with Discord name
    const isHeaderDiscordVisibleAfter = await page.locator('#btn-header-discord').isVisible();
    const isHeaderProfileVisibleAfter = await page.locator('#btn-open-profile').isVisible();
    console.log('After login - Header Discord button visible:', isHeaderDiscordVisibleAfter);
    console.log('After login - Header Profile button visible:', isHeaderProfileVisibleAfter);
    if (isHeaderDiscordVisibleAfter || !isHeaderProfileVisibleAfter) {
      throw new Error('After login, header must show #btn-open-profile and hide #btn-header-discord');
    }

    const headerProfileText = await page.locator('#btn-open-profile').innerText();
    console.log('Header profile text:', headerProfileText);
    if (!headerProfileText.includes('PlayerTester#8888')) {
      throw new Error(`Expected PlayerTester#8888 in header profile button, got: ${headerProfileText}`);
    }

    // Verify profile status changed to verified Discord
    const newBadgeText = await page.locator('#profile-status-badge').innerText();
    console.log('New profile badge text:', newBadgeText);
    if (!newBadgeText.includes('Discord')) {
      throw new Error(`Expected Discord badge, got: ${newBadgeText}`);
    }

    // Verify Leaderboard now shows PlayerTester#8888 as registered user with Discord badge
    await page.waitForSelector('.leaderboard-item');
    const myLbItem = page.locator('.leaderboard-item').filter({ hasText: 'PlayerTester#8888' }).first();
    const lbItemText = await myLbItem.innerText();
    console.log('Leaderboard item text:', lbItemText);
    if (!lbItemText.includes('PlayerTester#8888')) {
      throw new Error(`Expected PlayerTester#8888 in leaderboard, got: ${lbItemText}`);
    }

    const hasDiscordBadge = await myLbItem.locator('.lb-discord-badge').isVisible();
    console.log('Has Discord badge in leaderboard item:', hasDiscordBadge);
    if (!hasDiscordBadge) {
      throw new Error('Expected Discord badge svg in leaderboard item');
    }

    // Verify guest banner inside leaderboard is now GONE for registered user
    const hasGuestBannerNow = await page.locator('.lb-guest-banner').isVisible();
    console.log('Has guest banner after Discord login:', hasGuestBannerNow);
    if (hasGuestBannerNow) {
      throw new Error('Guest banner should not be visible when logged in via Discord');
    }

    console.log('--- TEST 3: Discord Logout returns to Guest ---');
    // Open Discord modal via profile management button
    await page.click('#btn-profile-discord-action');
    await page.waitForSelector('#modal-discord-auth.active');
    await page.click('#btn-discord-logout');

    const badgeAfterLogout = await page.locator('#profile-status-badge').innerText();
    console.log('Badge after logout:', badgeAfterLogout);
    if (!badgeAfterLogout.includes('Не авторизован')) {
      throw new Error('Expected guest status (Не авторизован) after logout');
    }

    const cardNameAfterLogout = await page.locator('#profile-card-name').innerText();
    console.log('Card name after logout:', cardNameAfterLogout);
    if (cardNameAfterLogout !== 'Гость') {
      throw new Error('Expected name Гость after logout');
    }

    // Header buttons should be reset
    const isHeaderDiscordAfterLogout = await page.locator('#btn-header-discord').isVisible();
    const isHeaderProfileAfterLogout = await page.locator('#btn-open-profile').isVisible();
    if (!isHeaderDiscordAfterLogout || isHeaderProfileAfterLogout) {
      throw new Error('After logout, header must show Discord button and hide profile button');
    }

    // Guest banner should be visible again
    const hasGuestBannerAfterLogout = await page.locator('.lb-guest-banner').isVisible();
    console.log('Has guest banner after logout:', hasGuestBannerAfterLogout);
    if (!hasGuestBannerAfterLogout) {
      throw new Error('Expected guest banner to reappear after logout');
    }

    // Current guest should NOT be marked as 'is-me' in leaderboard
    const myRankingsCount = await page.locator('.leaderboard-item.is-me').count();
    console.log('My ranking count after logout (is-me):', myRankingsCount);
    if (myRankingsCount !== 0) {
      throw new Error('Guest user should not be marked as "is-me" in leaderboard');
    }

    console.log('--- TEST 4: Host Leaves Lobby -> Guest redirected to Menu immediately ---');
    const hostPage = await context.newPage();
    const guestPage = await context.newPage();

    await hostPage.goto(`http://localhost:${PORT}`);
    await hostPage.waitForSelector('#screen-menu.active');
    await hostPage.click('#btn-create-room');
    await hostPage.waitForSelector('#screen-lobby.active');

    const roomCode = (await hostPage.locator('#lobby-room-code').innerText()).trim();
    console.log('Created room code:', roomCode);

    await guestPage.goto(`http://localhost:${PORT}`);
    await guestPage.waitForSelector('#screen-menu.active');
    await guestPage.fill('#input-join-code', roomCode);
    await guestPage.click('#form-join-room button[type="submit"]');
    await guestPage.waitForSelector('#screen-lobby.active');
    console.log('Guest joined lobby successfully');

    // Host leaves lobby
    console.log('Host leaving lobby...');
    await hostPage.click('#btn-leave-lobby');
    await hostPage.waitForSelector('#screen-menu.active');
    console.log('Host returned to menu');

    // Wait for guest page to switch to menu
    await guestPage.waitForSelector('#screen-menu.active', { timeout: 6000 });
    const guestScreen = await guestPage.evaluate(() => {
      const active = document.querySelector('.screen.active');
      return active ? active.id : null;
    });
    console.log('Guest active screen after host leave:', guestScreen);
    if (guestScreen !== 'screen-menu') {
      throw new Error(`Guest should be on screen-menu, but was on ${guestScreen}`);
    }

    console.log('ALL TESTS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
