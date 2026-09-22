import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(process.cwd(), reqPath);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(3344, async () => {
  console.log('Test server started on http://localhost:3344');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  }
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:3344');
    await page.waitForTimeout(1000);
    console.log('✓ Page loaded');

    // 1. Open Profile Modal
    await page.click('#btn-edit-profile-trigger');
    await page.waitForTimeout(300);
    console.log('✓ Profile modal opened');

    // 2. Click "Нарисовать свою пешку" button
    const btnOpenPawnEditor = await page.$('#btn-open-pawn-editor');
    if (!btnOpenPawnEditor) throw new Error('#btn-open-pawn-editor not found');
    await btnOpenPawnEditor.click();
    await page.waitForTimeout(500);
    console.log('✓ Pawn editor modal opened');

    // 3. Verify Canvas & Tools
    const canvas = await page.$('#pawn-editor-canvas');
    if (!canvas) throw new Error('#pawn-editor-canvas not found');
    
    // 4. Click a template (e.g. Cat)
    const catTemplate = await page.$('.pawn-template-chip[data-template="cat"]');
    if (!catTemplate) throw new Error('Cat template chip not found');
    await catTemplate.click();
    await page.waitForTimeout(300);
    console.log('✓ Cat template selected in editor');

    // 5. Click Save & Equip
    const btnSave = await page.$('#btn-pawn-save-equip');
    if (!btnSave) throw new Error('#btn-pawn-save-equip not found');
    await btnSave.click();
    await page.waitForTimeout(500);
    console.log('✓ Custom pawn saved and equipped');

    // 6. Verify custom pawn chip in token picker
    const customChip = await page.$('.md-chip[data-token="custom"]');
    if (!customChip) throw new Error('Custom token chip not displayed in picker');
    console.log('✓ Custom token chip displayed in profile modal');

    // 7. Save Profile Modal
    await page.click('#form-profile button[type="submit"]');
    await page.waitForTimeout(400);
    console.log('✓ Profile saved');

    // 8. Verify Header & Profile Card have custom token img
    const cardBadge = await page.$('#profile-card-badge .board-token-img');
    if (!cardBadge) throw new Error('Profile card badge does not show custom pawn img');
    console.log('✓ Profile card badge renders custom pawn image');

    // 9. Start solo / local test game to verify board token rendering
    await page.evaluate(() => {
      localStorage.setItem('monopoly_dev_mode', 'true');
    });
    await page.reload();
    await page.waitForTimeout(800);

    const btnTest = await page.$('#btn-create-test-room');
    if (btnTest) {
      await btnTest.click();
      await page.waitForTimeout(600);
      console.log('✓ Test lobby opened');

      // Check lobby player token slot has custom token img
      const lobbyTokenImg = await page.$('.player-slot .player-token .board-token-img');
      if (!lobbyTokenImg) throw new Error('Lobby slot does not render custom pawn img');
      console.log('✓ Lobby player slot renders custom pawn image');

      // Start game
      await page.click('#btn-start-game');
      await page.waitForTimeout(1000);
      console.log('✓ Game started');

      // Check board token and sidebar token
      const boardTokenImg = await page.$('.board-token .board-token-img');
      if (!boardTokenImg) throw new Error('Board token does not render custom pawn img');
      console.log('✓ Board token renders custom pawn image on the game board');

      const sidebarTokenImg = await page.$('.player-card-sidebar .sidebar-player-token-slot .board-token-img');
      if (!sidebarTokenImg) throw new Error('Sidebar player card does not render custom pawn img');
      console.log('✓ Sidebar player card renders custom pawn image');
    }

    console.log('\n🎉 ALL PAWN EDITOR TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
