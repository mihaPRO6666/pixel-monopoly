/**
 * Pawn Pixel Art Canvas Drawing Editor
 */

import { profileManager as importedProfileManager, renderTokenHTML } from './profile.js?v=8.0.0';
import { sound } from './audio.js?v=8.0.0';
import { showToast } from './ui.js?v=8.0.0';

const getProfileManager = () => (typeof window !== 'undefined' && window.profileManager) || importedProfileManager;

export const PAWN_GRID_SIZE = 16;

export const DEFAULT_PALETTE = [
  '#000000', '#334155', '#64748b', '#cbd5e1', '#ffffff',
  '#dc2626', '#ef4444', '#f97316', '#f59e0b', '#fde047',
  '#84cc16', '#22c55e', '#059669', '#06b6d4', '#38bdf8',
  '#2563eb', '#6366f1', '#9333ea', '#d946ef', '#ec4899',
  '#eab308', '#78350f', '#b45309', '#fed7aa'
];

export const PAWN_TEMPLATES = {
  pawn: {
    name: '♟️ Пешка',
    data: [
      "....########....",
      "...##########...",
      "..############..",
      "..############..",
      "...##########...",
      "....########....",
      ".....######.....",
      "....########....",
      "...##########...",
      "..############..",
      "..############..",
      ".##############.",
      "################",
      "################",
      ".##############.",
      "................"
    ],
    colorMap: { '#': '#ffffff', '.': null }
  },
  crown: {
    name: '👑 Корона',
    data: [
      ".#...#....#...#.",
      "###.###..###.###",
      "################",
      "################",
      "##.##..##..##.##",
      "##.##..##..##.##",
      "################",
      "##..########..##",
      "##..########..##",
      "################",
      "################",
      "################",
      ".##############.",
      "................",
      "................",
      "................"
    ],
    colorMap: { '#': '#eab308', '.': null }
  },
  diamond: {
    name: '💎 Алмаз',
    data: [
      ".....######.....",
      "...##########...",
      "..############..",
      ".##############.",
      "################",
      ".##############.",
      "..############..",
      "...##########...",
      "....########....",
      ".....######.....",
      "......####......",
      ".......##.......",
      "................",
      "................",
      "................",
      "................"
    ],
    colorMap: { '#': '#38bdf8', '.': null }
  },
  cat: {
    name: '🐱 Котик',
    data: [
      ".##..........##.",
      ".###........###.",
      ".####......####.",
      ".##############.",
      "################",
      "################",
      "##..######..####",
      "##..######..####",
      "################",
      "#######..#######",
      "######....######",
      "################",
      ".##############.",
      "..############..",
      "................",
      "................"
    ],
    colorMap: { '#': '#f97316', '.': null }
  },
  car: {
    name: '🚗 Машинка',
    data: [
      "................",
      "................",
      "......#####.....",
      "....#########...",
      "...###########..",
      "..#############.",
      "################",
      "################",
      "################",
      ".##.########.##.",
      ".##.########.##.",
      "....########....",
      "................",
      "................",
      "................",
      "................"
    ],
    colorMap: { '#': '#ef4444', '.': null }
  },
  star: {
    name: '⭐ Звезда',
    data: [
      ".......##.......",
      "......####......",
      "......####......",
      "################",
      ".##############.",
      "..############..",
      "...##########...",
      "....########....",
      "...##########...",
      "..############..",
      ".##############.",
      "###..........###",
      "##............##",
      "................",
      "................",
      "................"
    ],
    colorMap: { '#': '#fde047', '.': null }
  },
  ghost: {
    name: '👻 Призрак',
    data: [
      "....########....",
      "...##########...",
      "..############..",
      ".##############.",
      ".##############.",
      ".##..######..##.",
      ".##..######..##.",
      ".##############.",
      ".##############.",
      ".##############.",
      ".##############.",
      ".##############.",
      ".##.####.####.#.",
      ".#...##...##....",
      "................",
      "................"
    ],
    colorMap: { '#': '#cbd5e1', '.': null }
  },
  alien: {
    name: '👾 Пришелец',
    data: [
      "..##........##..",
      "...##......##...",
      "..############..",
      ".##############.",
      "################",
      "###..######..###",
      "################",
      "..############..",
      "...##......##...",
      "..##........##..",
      ".##..........##.",
      "................",
      "................",
      "................",
      "................",
      "................"
    ],
    colorMap: { '#': '#a855f7', '.': null }
  },
  duck: {
    name: '🦆 Уточка',
    data: [
      ".....######.....",
      "....########....",
      "....##.#####....",
      "....########....",
      "..############..",
      "################",
      "################",
      "################",
      ".##############.",
      "..############..",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................"
    ],
    colorMap: { '#': '#facc15', '.': null }
  },
  flame: {
    name: '🔥 Огонь',
    data: [
      ".......##.......",
      "......####......",
      ".....######.....",
      "....########....",
      "....########....",
      "...##########...",
      "..############..",
      ".##############.",
      "################",
      "################",
      ".##############.",
      "..############..",
      "...##########...",
      "................",
      "................",
      "................"
    ],
    colorMap: { '#': '#ea580c', '.': null }
  }
};

export class PawnEditor {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.grid = this.createEmptyGrid();
    this.currentColor = '#ffffff';
    this.currentTool = 'pencil'; // 'pencil', 'eraser', 'bucket', 'picker'
    this.isDrawing = false;
    this.undoStack = [];
    this.redoStack = [];
    this.onSaveCallback = null;
    this.eventsBound = false;
  }

  createEmptyGrid() {
    const g = [];
    for (let y = 0; y < PAWN_GRID_SIZE; y++) {
      g[y] = [];
      for (let x = 0; x < PAWN_GRID_SIZE; x++) {
        g[y][x] = null; // transparent
      }
    }
    return g;
  }

  init(onSaveCallback) {
    this.onSaveCallback = onSaveCallback;
    this.canvas = document.getElementById('pawn-editor-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    if (!this.eventsBound) {
      this.bindEvents();
      this.renderPalette();
      this.renderTemplates();
      this.eventsBound = true;
    }
    this.loadFromProfile();
    this.render();
  }

  bindEvents() {
    if (!this.canvas) return;

    // Mouse & Touch events
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const x = Math.floor(((clientX - rect.left) * scaleX) / (this.canvas.width / PAWN_GRID_SIZE));
      const y = Math.floor(((clientY - rect.top) * scaleY) / (this.canvas.height / PAWN_GRID_SIZE));
      return { x: Math.max(0, Math.min(PAWN_GRID_SIZE - 1, x)), y: Math.max(0, Math.min(PAWN_GRID_SIZE - 1, y)) };
    };

    const handleStart = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      this.pushUndo();
      const { x, y } = getPos(e);
      this.applyTool(x, y);
    };

    const handleMove = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const { x, y } = getPos(e);
      if (this.currentTool === 'pencil' || this.currentTool === 'eraser') {
        this.applyTool(x, y);
      }
    };

    const handleEnd = (e) => {
      this.isDrawing = false;
    };

    this.canvas.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    this.canvas.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    // Tools Buttons
    const toolBtns = document.querySelectorAll('.pawn-tool-btn');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sound.playClick();
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = btn.getAttribute('data-tool');
      });
    });

    // Undo / Redo / Clear
    document.getElementById('btn-pawn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-pawn-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-pawn-clear')?.addEventListener('click', () => this.clear());

    // Color picker input
    const colorInput = document.getElementById('pawn-color-picker');
    if (colorInput) {
      colorInput.addEventListener('input', (e) => {
        this.setColor(e.target.value);
      });
    }

    // Save & Equip Button
    document.getElementById('btn-pawn-save-equip')?.addEventListener('click', () => {
      this.saveAndEquip();
    });

    // Reset default button
    document.getElementById('btn-pawn-reset-default')?.addEventListener('click', () => {
      this.resetToDefault();
    });
  }

  setColor(hex) {
    this.currentColor = hex;
    const indicator = document.getElementById('pawn-current-color-indicator');
    if (indicator) indicator.style.backgroundColor = hex;
    const colorInput = document.getElementById('pawn-color-picker');
    if (colorInput) colorInput.value = hex;

    // If eraser was active, switch back to pencil
    if (this.currentTool === 'eraser') {
      const pencilBtn = document.querySelector('.pawn-tool-btn[data-tool="pencil"]');
      if (pencilBtn) pencilBtn.click();
    }
  }

  applyTool(x, y) {
    if (x < 0 || x >= PAWN_GRID_SIZE || y < 0 || y >= PAWN_GRID_SIZE) return;

    if (this.currentTool === 'pencil') {
      this.grid[y][x] = this.currentColor;
      this.render();
    } else if (this.currentTool === 'eraser') {
      this.grid[y][x] = null;
      this.render();
    } else if (this.currentTool === 'picker') {
      const picked = this.grid[y][x];
      if (picked) {
        this.setColor(picked);
        sound.playClick();
        const pencilBtn = document.querySelector('.pawn-tool-btn[data-tool="pencil"]');
        if (pencilBtn) pencilBtn.click();
      }
    } else if (this.currentTool === 'bucket') {
      this.floodFill(x, y, this.currentColor);
      this.render();
    }
  }

  floodFill(startX, startY, targetColor) {
    const orig = this.grid[startY][startX];
    if (orig === targetColor) return;

    const queue = [[startX, startY]];
    const visited = new Set();

    while (queue.length > 0) {
      const [x, y] = queue.pop();
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (x < 0 || x >= PAWN_GRID_SIZE || y < 0 || y >= PAWN_GRID_SIZE) continue;
      if (this.grid[y][x] !== orig) continue;

      this.grid[y][x] = targetColor;

      queue.push([x + 1, y]);
      queue.push([x - 1, y]);
      queue.push([x, y + 1]);
      queue.push([x, y - 1]);
    }
  }

  pushUndo() {
    const clone = this.grid.map(row => [...row]);
    this.undoStack.push(clone);
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return;
    sound.playClick();
    this.redoStack.push(this.grid.map(row => [...row]));
    this.grid = this.undoStack.pop();
    this.render();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    sound.playClick();
    this.undoStack.push(this.grid.map(row => [...row]));
    this.grid = this.redoStack.pop();
    this.render();
  }

  clear() {
    sound.playClick();
    this.pushUndo();
    this.grid = this.createEmptyGrid();
    this.render();
  }

  renderPalette() {
    const container = document.getElementById('pawn-palette-grid');
    if (!container) return;

    container.innerHTML = DEFAULT_PALETTE.map(color => `
      <button type="button" class="pawn-color-swatch" data-color="${color}" style="background-color: ${color};" title="${color}"></button>
    `).join('');

    container.querySelectorAll('.pawn-color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        sound.playClick();
        this.setColor(btn.getAttribute('data-color'));
      });
    });

    this.setColor(DEFAULT_PALETTE[0] === '#000000' ? '#ffffff' : DEFAULT_PALETTE[0]);
  }

  renderTemplates() {
    const container = document.getElementById('pawn-templates-grid');
    if (!container) return;

    container.innerHTML = Object.entries(PAWN_TEMPLATES).map(([key, tpl]) => `
      <button type="button" class="md-chip pawn-template-chip" data-template="${key}">
        <span>${tpl.name}</span>
      </button>
    `).join('');

    container.querySelectorAll('.pawn-template-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const tplKey = btn.getAttribute('data-template');
        this.loadTemplate(tplKey);
      });
    });
  }

  loadTemplate(templateKey) {
    const tpl = PAWN_TEMPLATES[templateKey];
    if (!tpl) return;
    sound.playClick();
    this.pushUndo();

    this.grid = this.createEmptyGrid();
    for (let y = 0; y < Math.min(PAWN_GRID_SIZE, tpl.data.length); y++) {
      const row = tpl.data[y];
      for (let x = 0; x < Math.min(PAWN_GRID_SIZE, row.length); x++) {
        const char = row[x];
        this.grid[y][x] = tpl.colorMap[char] || null;
      }
    }
    this.render();
  }

  loadFromProfile() {
    const pm = getProfileManager();
    const customToken = pm?.profile?.customToken;
    if (customToken && typeof customToken === 'string' && customToken.startsWith('data:image')) {
      this.loadFromDataURL(customToken);
    } else {
      this.loadTemplate('pawn');
    }
  }

  loadFromDataURL(dataUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = PAWN_GRID_SIZE;
      tempCanvas.height = PAWN_GRID_SIZE;
      const ctx = tempCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, PAWN_GRID_SIZE, PAWN_GRID_SIZE);

      const imgData = ctx.getImageData(0, 0, PAWN_GRID_SIZE, PAWN_GRID_SIZE).data;
      this.grid = this.createEmptyGrid();

      for (let y = 0; y < PAWN_GRID_SIZE; y++) {
        for (let x = 0; x < PAWN_GRID_SIZE; x++) {
          const idx = (y * PAWN_GRID_SIZE + x) * 4;
          const a = imgData[idx + 3];
          if (a > 30) {
            const r = imgData[idx].toString(16).padStart(2, '0');
            const g = imgData[idx + 1].toString(16).padStart(2, '0');
            const b = imgData[idx + 2].toString(16).padStart(2, '0');
            this.grid[y][x] = `#${r}${g}${b}`;
          } else {
            this.grid[y][x] = null;
          }
        }
      }
      this.render();
    };
    img.src = dataUrl;
  }

  render() {
    if (!this.canvas || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cellSize = w / PAWN_GRID_SIZE;

    this.ctx.clearRect(0, 0, w, h);

    // Draw checkered transparency background
    const checkSize = cellSize / 2;
    for (let y = 0; y < h; y += checkSize) {
      for (let x = 0; x < w; x += checkSize) {
        const isDark = ((x / checkSize) + (y / checkSize)) % 2 === 0;
        this.ctx.fillStyle = isDark ? '#1e293b' : '#0f172a';
        this.ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    // Draw pixels
    for (let y = 0; y < PAWN_GRID_SIZE; y++) {
      for (let x = 0; x < PAWN_GRID_SIZE; x++) {
        const color = this.grid[y][x];
        if (color) {
          this.ctx.fillStyle = color;
          this.ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    // Draw pixel grid lines
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= PAWN_GRID_SIZE; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(i * cellSize, 0);
      this.ctx.lineTo(i * cellSize, h);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(0, i * cellSize);
      this.ctx.lineTo(w, i * cellSize);
      this.ctx.stroke();
    }

    // Update live previews
    this.updatePreviews();
  }

  getPNGDataURL() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = PAWN_GRID_SIZE;
    exportCanvas.height = PAWN_GRID_SIZE;
    const exportCtx = exportCanvas.getContext('2d');
    exportCtx.clearRect(0, 0, PAWN_GRID_SIZE, PAWN_GRID_SIZE);

    for (let y = 0; y < PAWN_GRID_SIZE; y++) {
      for (let x = 0; x < PAWN_GRID_SIZE; x++) {
        const color = this.grid[y][x];
        if (color) {
          exportCtx.fillStyle = color;
          exportCtx.fillRect(x, y, 1, 1);
        }
      }
    }

    return exportCanvas.toDataURL('image/png');
  }

  updatePreviews() {
    const dataUrl = this.getPNGDataURL();
    const pm = getProfileManager();

    const previewBoard = document.getElementById('pawn-preview-board');
    if (previewBoard) {
      previewBoard.innerHTML = `<img src="${dataUrl}" class="board-token-img" alt="Pawn" draggable="false" />`;
      previewBoard.style.borderColor = pm?.profile?.color || '#2563eb';
    }

    const previewSidebar = document.getElementById('pawn-preview-sidebar');
    if (previewSidebar) {
      previewSidebar.innerHTML = `<img src="${dataUrl}" class="token-custom-img" alt="Pawn" draggable="false" />`;
    }
  }

  saveAndEquip() {
    const dataUrl = this.getPNGDataURL();
    const pm = getProfileManager();
    if (pm) {
      pm.setCustomToken(dataUrl);
    }
    try {
      const raw = localStorage.getItem('monopoly_player_profile');
      const p = raw ? JSON.parse(raw) : {};
      p.token = 'custom';
      p.customToken = dataUrl;
      localStorage.setItem('monopoly_player_profile', JSON.stringify(p));
    } catch (e) {}

    sound.playCash();
    showToast('✨ Ваша собственная пешка сохранена и надета!');

    if (typeof this.onSaveCallback === 'function') {
      this.onSaveCallback(dataUrl);
    }

    const modal = document.getElementById('modal-pawn-editor');
    if (modal) modal.classList.remove('active');
  }

  resetToDefault() {
    sound.playClick();
    const pm = getProfileManager();
    if (pm) {
      pm.profile.customToken = null;
      pm.profile.token = '💎';
      pm.saveProfile();
    }
    try {
      const raw = localStorage.getItem('monopoly_player_profile');
      const p = raw ? JSON.parse(raw) : {};
      p.token = '💎';
      p.customToken = null;
      localStorage.setItem('monopoly_player_profile', JSON.stringify(p));
    } catch (e) {}
    showToast('Сброшено к стандартной фишке 💎');

    if (typeof this.onSaveCallback === 'function') {
      this.onSaveCallback(null);
    }

    const modal = document.getElementById('modal-pawn-editor');
    if (modal) modal.classList.remove('active');
  }
}

export const pawnEditor = new PawnEditor();
