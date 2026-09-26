import { readFileSync, writeFileSync } from 'fs';

const boldBuf = readFileSync('./fonts/font-bold.ttf');
const regBuf = readFileSync('./fonts/font.ttf');

console.log('Bold size:', boldBuf.length, 'magic:', boldBuf.slice(0, 4).toString('hex'));
console.log('Reg size:', regBuf.length, 'magic:', regBuf.slice(0, 4).toString('hex'));

const js = `// Embedded Arial/Roboto TTF fonts for 0ms cold-start Resvg rendering
export const FONT_BOLD = Buffer.from('${boldBuf.toString('base64')}', 'base64');
export const FONT_REGULAR = Buffer.from('${regBuf.toString('base64')}', 'base64');
`;

writeFileSync('./api/fonts-data.js', js, 'utf8');
console.log('✅ Generated api/fonts-data.js, size:', js.length);
