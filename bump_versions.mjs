import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const srcDir = './src';
const files = readdirSync(srcDir).filter(f => f.endsWith('.js'));

let totalReplaced = 0;

for (const file of files) {
  const path = join(srcDir, file);
  const original = readFileSync(path, 'utf8');
  const updated = original.replaceAll('?v=8.0.0', '?v=8.5.0');
  if (updated !== original) {
    writeFileSync(path, updated, 'utf8');
    const count = (original.match(/\?v=8\.0\.0/g) || []).length;
    console.log(`Updated ${file}: ${count} replacements`);
    totalReplaced += count;
  } else {
    console.log(`Skipped ${file}: no matches`);
  }
}

// Also fix index.html script tag
const html = readFileSync('./index.html', 'utf8');
const htmlUpdated = html.replace('src/app.js?v=8.4.8', 'src/app.js?v=8.5.0');
if (htmlUpdated !== html) {
  writeFileSync('./index.html', htmlUpdated, 'utf8');
  console.log('Updated index.html: 1 replacement (v8.4.8 -> v8.5.0)');
  totalReplaced++;
}

console.log(`\nTotal replacements: ${totalReplaced}`);
