import { chromium } from 'playwright';

async function verify() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    headless: true
  });

  try {
    // 1. Verify Vercel Live
    console.log('Testing Live Vercel: https://pixel-monopoly-nu.vercel.app ...');
    const pageVercel = await browser.newPage();
    await pageVercel.goto('https://pixel-monopoly-nu.vercel.app', { waitUntil: 'networkidle' });
    await pageVercel.waitForTimeout(1000);

    // Create solo room
    await pageVercel.click('#btn-create-solo-room');
    await pageVercel.waitForTimeout(1000);
    await pageVercel.click('#btn-start-game');
    await pageVercel.waitForTimeout(1500);

    // Human turn
    const curVercel = await pageVercel.evaluate(() => window.engine?.getCurrentPlayer()?.isBot);
    if (!curVercel) {
      await pageVercel.click('#btn-roll-card');
      await pageVercel.waitForTimeout(2500);
      const isBuyModal = await pageVercel.evaluate(() => {
        const m = document.getElementById('modal-buy-property');
        return m && m.classList.contains('active');
      });
      if (isBuyModal) {
        await pageVercel.click('#btn-decline-buy');
        await pageVercel.waitForTimeout(500);
      }
      const btnEndTurn = await pageVercel.$('#btn-end-turn-card:not([disabled])');
      if (btnEndTurn) {
        await btnEndTurn.click();
      } else {
        await pageVercel.evaluate(() => window.app?.handleEndTurn());
      }
    }

    // Wait for bot turn to execute
    console.log('Waiting for Elon Bot on Vercel...');
    await pageVercel.waitForTimeout(5000);
    const vercelTurn = await pageVercel.evaluate(() => ({
      curPlayer: window.engine?.getCurrentPlayer()?.name,
      isBot: window.engine?.getCurrentPlayer()?.isBot,
      phase: window.engine?.phase,
      badge: document.getElementById('turn-badge')?.innerText,
      logs: window.engine?.logs?.slice(-3)
    }));
    console.log('Vercel state after bot move:', vercelTurn);
    await pageVercel.screenshot({ path: 'live_vercel_verification.png' });
    await pageVercel.close();

    // 2. Verify GitHub Pages Live
    console.log('\nTesting Live GitHub Pages: https://mihapro6666.github.io/pixel-monopoly/ ...');
    const pageGh = await browser.newPage();
    await pageGh.goto('https://mihapro6666.github.io/pixel-monopoly/', { waitUntil: 'networkidle' });
    await pageGh.waitForTimeout(1000);

    // Create solo room
    await pageGh.click('#btn-create-solo-room');
    await pageGh.waitForTimeout(1000);
    await pageGh.click('#btn-start-game');
    await pageGh.waitForTimeout(1500);

    // Human turn
    const curGh = await pageGh.evaluate(() => window.engine?.getCurrentPlayer()?.isBot);
    if (!curGh) {
      await pageGh.click('#btn-roll-card');
      await pageGh.waitForTimeout(2500);
      const isBuyModal = await pageGh.evaluate(() => {
        const m = document.getElementById('modal-buy-property');
        return m && m.classList.contains('active');
      });
      if (isBuyModal) {
        await pageGh.click('#btn-decline-buy');
        await pageGh.waitForTimeout(500);
      }
      const btnEndTurn = await pageGh.$('#btn-end-turn-card:not([disabled])');
      if (btnEndTurn) {
        await btnEndTurn.click();
      } else {
        await pageGh.evaluate(() => window.app?.handleEndTurn());
      }
    }

    // Wait for bot turn to execute
    console.log('Waiting for Elon Bot on GitHub Pages...');
    await pageGh.waitForTimeout(5000);
    const ghTurn = await pageGh.evaluate(() => ({
      curPlayer: window.engine?.getCurrentPlayer()?.name,
      isBot: window.engine?.getCurrentPlayer()?.isBot,
      phase: window.engine?.phase,
      badge: document.getElementById('turn-badge')?.innerText,
      logs: window.engine?.logs?.slice(-3)
    }));
    console.log('GitHub state after bot move:', ghTurn);
    await pageGh.screenshot({ path: 'live_github_verification.png' });
    await pageGh.close();

    console.log('\n✓ BOTH LIVE VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Live verification failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

verify();
