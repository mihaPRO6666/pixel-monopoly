import { readFileSync, writeFileSync } from 'fs';

const boldBuf = readFileSync('./fonts/Roboto-Bold.ttf');
const regBuf = readFileSync('./fonts/Roboto-Regular.ttf');

const js = `// Embedded Roboto TTF fonts for 0ms cold-start Resvg rendering
export const ROBOTO_BOLD = Buffer.from('${boldBuf.toString('base64')}', 'base64');
export const ROBOTO_REGULAR = Buffer.from('${regBuf.toString('base64')}', 'base64');
`;

writeFileSync('./api/fonts-data.js', js, 'utf8');
console.log('✅ Generated api/fonts-data.js, size:', js.length);
