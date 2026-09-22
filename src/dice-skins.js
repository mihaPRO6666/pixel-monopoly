/**
 * Custom Dice Skins & Case Opening Mechanics
 */

export const DICE_SKINS = [
  {
    id: 'classic',
    name: 'Классические',
    icon: '🎲',
    rarity: 'common',
    rarityName: 'Обычный',
    rarityColor: '#94a3b8',
    weight: 0, // Default skin, not in case drop pool
    bgStyle: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)',
    textColor: '#0f172a',
    borderStyle: '2px solid rgba(0, 0, 0, 0.12)',
    glow: '0 8px 20px rgba(0, 0, 0, 0.14)',
    desc: 'Традиционные белые игральные кости с лакированными чёрными точками (доступны всем по умолчанию).'
  },
  {
    id: 'neon_ruby',
    name: 'Неоновый Рубин',
    icon: '🔴',
    rarity: 'rare',
    rarityName: 'Редкий',
    rarityColor: '#f43f5e',
    weight: 30,
    bgStyle: 'linear-gradient(135deg, #4c0519 0%, #9f1239 50%, #e11d48 100%)',
    textColor: '#ffffff',
    borderStyle: '2px solid #f43f5e',
    glow: '0 0 20px rgba(244, 63, 94, 0.55), inset 0 0 10px rgba(255, 255, 255, 0.2)',
    desc: 'Пылающий неоновым светом драгоценный кристалл рубина.'
  },
  {
    id: 'cyber_emerald',
    name: 'Кибер-Изумруд',
    icon: '🟢',
    rarity: 'rare',
    rarityName: 'Редкий',
    rarityColor: '#10b981',
    weight: 30,
    bgStyle: 'linear-gradient(135deg, #022c22 0%, #065f46 50%, #059669 100%)',
    textColor: '#a7f3d0',
    borderStyle: '2px solid #10b981',
    glow: '0 0 20px rgba(16, 185, 129, 0.55), inset 0 0 10px rgba(167, 243, 208, 0.25)',
    desc: 'Светящиеся матричные кости из киберпанк-будущего.'
  },
  {
    id: 'amethyst_twilight',
    name: 'Аметистовая Ночь',
    icon: '🟣',
    rarity: 'epic',
    rarityName: 'Эпический',
    rarityColor: '#a855f7',
    weight: 15,
    bgStyle: 'linear-gradient(135deg, #2e1065 0%, #581c87 50%, #7e22ce 100%)',
    textColor: '#f3e8ff',
    borderStyle: '2px solid #c084fc',
    glow: '0 0 22px rgba(168, 85, 247, 0.6), inset 0 0 12px rgba(243, 232, 255, 0.3)',
    desc: 'Магический фиолетовый аметист, мерцающий звёздным сиянием.'
  },
  {
    id: 'frost_crystal',
    name: 'Ледяной Кристалл',
    icon: '❄️',
    rarity: 'epic',
    rarityName: 'Эпический',
    rarityColor: '#38bdf8',
    weight: 15,
    bgStyle: 'linear-gradient(135deg, #082f49 0%, #0369a1 50%, #38bdf8 100%)',
    textColor: '#ffffff',
    borderStyle: '2px solid #7dd3fc',
    glow: '0 0 22px rgba(56, 189, 248, 0.65), inset 0 0 12px rgba(255, 255, 255, 0.4)',
    desc: 'Замёрзший арктический лёд вечной мерзлоты.'
  },
  {
    id: 'golden_tycoon',
    name: 'Золотой Магнат',
    icon: '🟡',
    rarity: 'legendary',
    rarityName: 'Легендарный',
    rarityColor: '#eab308',
    weight: 4,
    bgStyle: 'linear-gradient(135deg, #713f12 0%, #ca8a04 40%, #fef08a 70%, #eab308 100%)',
    textColor: '#422006',
    borderStyle: '2px solid #fde047',
    glow: '0 0 25px rgba(234, 179, 8, 0.8), inset 0 0 14px rgba(255, 255, 255, 0.6)',
    desc: 'Слиток чистейшего 24-каратного золота для истинных монополистов.'
  },
  {
    id: 'magma_flame',
    name: 'Огненная Лава',
    icon: '🔥',
    rarity: 'legendary',
    rarityName: 'Легендарный',
    rarityColor: '#f97316',
    weight: 4,
    bgStyle: 'linear-gradient(135deg, #431407 0%, #9a3412 40%, #ea580c 70%, #ffedd5 100%)',
    textColor: '#fff7ed',
    borderStyle: '2px solid #fb923c',
    glow: '0 0 25px rgba(249, 115, 22, 0.8), inset 0 0 14px rgba(255, 237, 213, 0.5)',
    desc: 'Раскалённая вулканическая лава прямо из недр вулкана.'
  },
  {
    id: 'cosmic_void',
    name: 'Сингулярность',
    icon: '🌌',
    rarity: 'legendary',
    rarityName: 'Легендарный',
    rarityColor: '#818cf8',
    weight: 2,
    bgStyle: 'linear-gradient(135deg, #09090b 0%, #1e1b4b 40%, #4338ca 70%, #c084fc 100%)',
    textColor: '#ffffff',
    borderStyle: '2px solid #818cf8',
    glow: '0 0 28px rgba(129, 140, 248, 0.85), inset 0 0 14px rgba(192, 132, 252, 0.5)',
    desc: 'Эпицентр космической чёрной дыры, преломляющий само пространство.'
  }
];

export const CASE_PRICE = 50;
export const DUPLICATE_COINS_REFUND = 20;

export const CASE_DROPPABLE_SKINS = DICE_SKINS.filter(s => s.id !== 'classic');

export function getDiceSkin(skinId) {
  return DICE_SKINS.find(s => s.id === skinId) || DICE_SKINS[0];
}

export function rollDiceSkinFromCase() {
  const droppable = CASE_DROPPABLE_SKINS;
  const totalWeight = droppable.reduce((acc, s) => acc + s.weight, 0);
  let random = Math.random() * totalWeight;

  for (const skin of droppable) {
    if (random < skin.weight) {
      return skin;
    }
    random -= skin.weight;
  }
  return droppable[0];
}

export function getDiceFaceRotations(value) {
  switch (parseInt(value)) {
    case 1: return { x: 0, y: 0 };
    case 2: return { x: -90, y: 0 };
    case 3: return { x: 0, y: -90 };
    case 4: return { x: 0, y: 90 };
    case 5: return { x: 90, y: 0 };
    case 6: return { x: 180, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

export function renderDicePipsHTML(value) {
  const v = Math.max(1, Math.min(6, parseInt(value) || 1));
  let pips = '';
  for (let i = 0; i < v; i++) {
    pips += '<span class="dice-pip"></span>';
  }
  return pips;
}

export function create2DDiceHTML(skinId = 'classic', value = 1, extraClasses = '') {
  const skin = getDiceSkin(skinId);
  const v = Math.max(1, Math.min(6, parseInt(value) || 1));
  return `
    <div class="dice-2d-item skin-${skin.id} ${extraClasses}" data-value="${v}">
      <div class="dice-pixel-box">
        <img class="dice-pixel-img" src="assets/dice/dice_${v}_normal.png" alt="Dice ${v}" draggable="false" />
      </div>
    </div>
  `;
}

export function create3DDiceHTML(skinId = 'classic', value = 1, extraClasses = '') {
  const rot = getDiceFaceRotations(value);
  const skin = getDiceSkin(skinId);
  return `
    <div class="dice-3d-wrapper ${extraClasses}">
      <div class="dice-3d-cube skin-${skin.id}" data-face="${value}" style="transform: rotateX(${rot.x}deg) rotateY(${rot.y}deg);">
        <div class="dice-face face-front face-1" title="1"><span class="dice-pip"></span></div>
        <div class="dice-face face-top face-2" title="2"><span class="dice-pip"></span><span class="dice-pip"></span></div>
        <div class="dice-face face-right face-3" title="3"><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span></div>
        <div class="dice-face face-left face-4" title="4"><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span></div>
        <div class="dice-face face-bottom face-5" title="5"><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span></div>
        <div class="dice-face face-back face-6" title="6"><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span><span class="dice-pip"></span></div>
      </div>
    </div>
  `;
}

export function applyDiceSkinToElement(el, skinId) {
  if (!el) return;
  const skin = getDiceSkin(skinId);
  const cube = el.classList.contains('dice-3d-cube') ? el : el.querySelector('.dice-3d-cube');
  const item2d = el.classList.contains('dice-2d-item') ? el : el.querySelector('.dice-2d-item');
  if (cube) {
    // Remove all skin-* classes
    DICE_SKINS.forEach(s => cube.classList.remove(`skin-${s.id}`));
    cube.classList.add(`skin-${skin.id}`);
  } else if (item2d) {
    DICE_SKINS.forEach(s => item2d.classList.remove(`skin-${s.id}`));
    item2d.classList.add(`skin-${skin.id}`);
  } else {
    el.style.background = skin.bgStyle;
    el.style.color = skin.textColor;
    el.style.border = skin.borderStyle;
    el.style.boxShadow = skin.glow;
  }
}

