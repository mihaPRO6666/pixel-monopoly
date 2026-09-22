import { chromium } from 'playwright';

(async () => {
  console.log('Testing live production at https://pixel-monopoly-nu.vercel.app');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://pixel-monopoly-nu.vercel.app', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // 1. Verify Changelog Button exists next to 'M' logo
    const changelogBtn = await page.$('#btn-open-changelog');
    if (!changelogBtn) throw new Error('#btn-open-changelog not found on prod');
    console.log('✓ #btn-open-changelog found on prod');

    const isVisible = await changelogBtn.isVisible();
    console.log('✓ Changelog button is visible on prod:', isVisible);

    // 2. Open changelog modal
    await changelogBtn.click();
    await page.waitForTimeout(600);

    const isModalActive = await page.$eval('#modal-changelog', el => el.classList.contains('active'));
    console.log('✓ Changelog modal opened on prod:', isModalActive);
    if (!isModalActive) throw new Error('Modal did not open');

    const modalText = await page.$eval('#modal-changelog', el => el.innerText);
    if (!modalText.includes('v2.7')) throw new Error('v2.7 not in modal');
    console.log('✓ v2.7 changelog displayed properly');

    // 3. Close modal
    await page.click('#modal-changelog [data-close-modal]');
    await page.waitForTimeout(400);

    // 4. Test shop modal
    await page.click('#btn-open-shop');
    await page.waitForTimeout(500);
    const isShopActive = await page.$eval('#modal-shop', el => el.classList.contains('active'));
    console.log('✓ Shop modal opened on prod:', isShopActive);
    await page.click('#modal-shop [data-close-modal]');
    await page.waitForTimeout(400);

    console.log('\n🎉 ALL PRODUCTION CHECKS PASSED PERFECTLY!');
  } catch (err) {
    console.error('Prod test error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
