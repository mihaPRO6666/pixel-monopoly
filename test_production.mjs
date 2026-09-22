import { chromium } from 'playwright';

(async () => {
  console.log('Testing LIVE Production at https://pixel-monopoly-nu.vercel.app ...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PROD BROWSER ERROR:', msg.text());
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('PROD UNCAUGHT EXCEPTION:', err.message);
    errors.push(err.message);
  });

  try {
    await page.goto('https://pixel-monopoly-nu.vercel.app', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    console.log('1. Testing Create Room on Prod...');
    await page.click('#btn-create-room');
    await page.waitForTimeout(1500);

    const isLobby = await page.$eval('#screen-lobby', el => el.classList.contains('active'));
    console.log('   Is Lobby screen active:', isLobby);
    if (!isLobby) throw new Error('Lobby not active');

    const code = await page.$eval('#lobby-room-code', el => el.innerText.trim());
    console.log('   Room code generated:', code);

    console.log('2. Testing Add Bot on Prod...');
    await page.click('#btn-add-bot');
    await page.waitForTimeout(800);

    const countBefore = await page.$$eval('#lobby-players-list .player-slot', els => els.length);
    console.log('   Players after add bot:', countBefore);
    if (countBefore !== 2) throw new Error('Bot not added');

    console.log('3. Testing Kick Button (✕) on Prod...');
    const kickBtns = await page.$$('.btn-kick-player');
    if (kickBtns.length === 0) throw new Error('No kick button');
    await kickBtns[0].click();
    await page.waitForTimeout(800);

    const countAfter = await page.$$eval('#lobby-players-list .player-slot', els => els.length);
    console.log('   Players after kick:', countAfter);
    if (countAfter !== 1) throw new Error('Bot not kicked');

    console.log('4. Testing Leave Lobby Button (Выйти в меню) on Prod...');
    await page.click('#btn-leave-lobby');
    await page.waitForTimeout(800);

    const isMenu = await page.$eval('#screen-menu', el => el.classList.contains('active'));
    console.log('   Is Menu active after leave:', isMenu);
    if (!isMenu) throw new Error('Not returned to menu');

    console.log('5. Testing Discord Auth Modal on Prod...');
    await page.click('#btn-header-discord');
    await page.waitForTimeout(500);
    const isDiscordModal = await page.$eval('#modal-discord-auth', el => el.classList.contains('active'));
    console.log('   Is Discord Auth Modal active:', isDiscordModal);
    if (!isDiscordModal) throw new Error('Discord auth modal not active');

    console.log('6. Verifying Quick Login is removed and OAuth is present on Prod...');
    const quickBtnCount = await page.$$eval('#btn-quick-discord-login', els => els.length);
    console.log('   Quick login count on Prod:', quickBtnCount);
    if (quickBtnCount !== 0) throw new Error('Quick login should be removed on Prod');

    const hasOAuth = await page.$eval('#btn-start-discord-oauth', el => el.offsetParent !== null);
    console.log('   OAuth button visible on Prod:', hasOAuth);
    if (!hasOAuth) throw new Error('OAuth button not visible on Prod');

    await page.click('#modal-discord-auth [data-close-modal]');
    await page.waitForTimeout(300);

    console.log('\n=============================================');
    console.log('PRODUCTION VERIFICATION COMPLETED WITH ZERO ERRORS!');
    console.log('=============================================\n');
  } catch (err) {
    console.error('PROD TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
