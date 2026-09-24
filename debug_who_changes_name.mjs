import { chromium } from 'playwright';

async function debugName() {
  console.log('Connecting to live Vercel to inspect name mutations...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    headless: true
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log('[BROWSER]', msg.type(), msg.text());
  });

  await page.goto('https://mihapro6666.github.io/pixel-monopoly/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Hook into profile.name with a getter/setter to catch ANY mutation
  await page.evaluate(() => {
    const pm = window.profileManager;
    let _name = pm.profile.name;
    console.log('Initial profile name is:', _name);

    Object.defineProperty(pm.profile, 'name', {
      get() {
        return _name;
      },
      set(val) {
        const stack = new Error().stack;
        console.warn(`[NAME_MUTATION] profile.name CHANGED from "${_name}" to "${val}"!\nStack trace:\n${stack}`);
        _name = val;
      },
      configurable: true,
      enumerable: true
    });
  });

  // Open profile modal
  console.log('Opening profile modal...');
  await page.evaluate(() => window.app.openProfileModal());
  await page.waitForTimeout(1000);

  // Change name to "SuperTester"
  console.log('Changing nickname in input to "SuperTester"...');
  const nameInput = await page.$('#input-profile-name');
  await nameInput.fill('SuperTester');
  await page.waitForTimeout(500);

  // Submit form
  console.log('Submitting form-profile...');
  await page.evaluate(() => {
    document.getElementById('form-profile').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });

  console.log('Waiting 10 seconds to monitor all events and see if name resets...');
  for (let i = 1; i <= 10; i++) {
    await page.waitForTimeout(1000);
    const curName = await page.evaluate(() => window.profileManager.profile.name);
    const cardName = await page.evaluate(() => document.getElementById('profile-card-name')?.innerText);
    const headerName = await page.evaluate(() => document.getElementById('profile-name-display')?.innerText);
    console.log(`[Second ${i}] profile.name="${curName}", card="${cardName}", header="${headerName}"`);
  }

  await browser.close();
}

debugName().catch(console.error);
