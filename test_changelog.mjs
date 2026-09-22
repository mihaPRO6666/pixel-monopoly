import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Minimal static server
const server = http.createServer((req, res) => {
  let filePath = path.join(process.cwd(), req.url.split('?')[0]);
  if (req.url === '/' || req.url.startsWith('/?')) {
    filePath = path.join(process.cwd(), 'index.html');
  }
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const contentType = ext === '.html' ? 'text/html' :
                        ext === '.js' ? 'application/javascript' :
                        ext === '.css' ? 'text/css' :
                        ext === '.json' ? 'application/json' : 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3334, async () => {
  console.log('Test server started on http://localhost:3334');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3334');
    await page.waitForTimeout(1000);

    // 1. Verify Changelog button exists next to brand logo
    const changelogBtn = await page.$('#btn-open-changelog');
    if (!changelogBtn) throw new Error('#btn-open-changelog not found');
    console.log('✓ #btn-open-changelog exists');

    const isVisible = await changelogBtn.isVisible();
    if (!isVisible) throw new Error('#btn-open-changelog is not visible');
    console.log('✓ #btn-open-changelog is visible');

    // 2. Click changelog button and check modal opens
    await changelogBtn.click();
    await page.waitForTimeout(500);

    const isModalActive = await page.$eval('#modal-changelog', el => el.classList.contains('active'));
    if (!isModalActive) throw new Error('#modal-changelog did not become active on click');
    console.log('✓ #modal-changelog opened successfully');

    // 3. Verify modal contents
    const modalText = await page.$eval('#modal-changelog', el => el.innerText);
    if (!modalText.includes('v2.7') || !modalText.includes('Журнал обновлений')) {
      throw new Error('Changelog modal does not contain expected version texts');
    }
    console.log('✓ Changelog modal contains v2.7 and update notes');

    // 4. Close modal
    await page.click('#modal-changelog [data-close-modal]');
    await page.waitForTimeout(300);
    const isModalClosed = await page.$eval('#modal-changelog', el => !el.classList.contains('active'));
    if (!isModalClosed) throw new Error('#modal-changelog did not close');
    console.log('✓ #modal-changelog closed successfully');

    console.log('\n🎉 ALL CHANGELOG TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
