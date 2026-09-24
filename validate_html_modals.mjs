import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');

const modalIds = [
  'modal-buy-property',
  'modal-card',
  'modal-deed',
  'modal-manage-properties',
  'modal-profile',
  'modal-pawn-editor',
  'modal-view-player-profile',
  'modal-shop',
  'modal-case-roulette',
  'modal-admin-panel',
  'modal-changelog',
  'modal-discord-auth',
  'modal-confirm',
  'modal-trade',
  'modal-trade-incoming',
  'modal-trade-history',
  'modal-leaderboard',
  'modal-match-history',
  'modal-winner',
  'modal-custom-tiles',
  'modal-settings',
  'modal-theme-selector'
];

let errors = [];
modalIds.forEach(id => {
  const openTag = `<div class="md-modal-backdrop" id="${id}"`;
  const idx = html.indexOf(openTag);
  if (idx === -1) {
    errors.push(`Missing modal: ${id}`);
    return;
  }
  
  // Find where this modal ends
  const nextModalIndices = modalIds
    .map(otherId => html.indexOf(`<div class="md-modal-backdrop" id="${otherId}"`))
    .filter(i => i > idx)
    .sort((a, b) => a - b);
  
  const endIdx = nextModalIndices.length > 0 ? nextModalIndices[0] : html.indexOf('<div id="toast-container"');
  const modalChunk = html.substring(idx, endIdx);
  
  const openDivs = (modalChunk.match(/<div(\s|>)/g) || []).length;
  const closeDivs = (modalChunk.match(/<\/div>/g) || []).length;
  console.log(`Modal ${id}: open=${openDivs}, close=${closeDivs}`);
  if (openDivs !== closeDivs) {
    errors.push(`Modal ${id} unbalanced divs: open=${openDivs} close=${closeDivs}`);
  }
});

if (errors.length > 0) {
  console.error('Validation errors:', errors);
  process.exit(1);
} else {
  console.log('✓ All 22 modals have perfectly balanced tags!');
  process.exit(0);
}
