import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const FROM = '?v=8.5.0';
const TO = '?v=8.5.1';
const HTML_FROM = 'src/app.js?v=8.5.0';
const HTML_TO = 'src/app.js?v=8.5.1';

const srcDir = './src';
const files = readdirSync(srcDir).filter(f => f.endsWith('.js'));

let totalReplaced = 0;

for (const file of files) {
  const path = join(srcDir, file);
  const original = readFileSync(path, 'utf8');
  const updated = original.replaceAll(FROM, TO);
  if (updated !== original) {
    writeFileSync(path, updated, 'utf8');
    const count = (original.split(FROM).length - 1);
    console.log(`Updated ${file}: ${count} replacements`);
    totalReplaced += count;
  } else {
    console.log(`Skipped ${file}: no matches`);
  }
}

// Also fix index.html script tag
const html = readFileSync('./index.html', 'utf8');
const htmlUpdated = html.replace(HTML_FROM, HTML_TO);
if (htmlUpdated !== html) {
  writeFileSync('./index.html', htmlUpdated, 'utf8');
  console.log(`Updated index.html: (${HTML_FROM} -> ${HTML_TO})`);
  totalReplaced++;
}

console.log(`\nTotal replacements: ${totalReplaced}`);
