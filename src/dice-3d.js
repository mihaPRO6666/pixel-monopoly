/**
 * Real WebGL 3D Dice Engine using Three.js
 * High-detail PBR 3D Dice Models with Physical Simulation & 8 Theme Materials
 */

import { getDiceSkin, DICE_SKINS } from './dice-skins.js';

// Cache for generated canvas textures
const textureCache = new Map();

/**
 * Generate high-res 1024x1024 canvas texture for a specific dice face & skin
 */
export function createDiceFaceCanvas(value, skinId = 'classic') {
  const cacheKey = `${skinId}_face_hd_${value}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const skin = getDiceSkin(skinId);

  // 1. Draw Face Background based on skin with rounded borders
  ctx.save();
  const radius = 130;
  const w = 1024;
  const h = 1024;

  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(w - radius, 0);
  ctx.quadraticCurveTo(w, 0, w, radius);
  ctx.lineTo(w, h - radius);
  ctx.quadraticCurveTo(w, h, w - radius, h);
  ctx.lineTo(radius, h);
  ctx.quadraticCurveTo(0, h, 0, h - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.clip();

  // Draw skin-specific background
  switch (skinId) {
    case 'neon_ruby': {
      const grad = ctx.createRadialGradient(512, 512, 100, 512, 512, 720);
      grad.addColorStop(0, '#e11d48');
      grad.addColorStop(0.5, '#9f1239');
      grad.addColorStop(1, '#3a0210');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 1024);

      // Inner glowing neon rim
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 32;
      ctx.strokeRect(16, 16, 992, 992);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 8;
      ctx.strokeRect(36, 36, 952, 952);
      break;
    }
    case 'cyber_emerald': {
      const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
      grad.addColorStop(0, '#022c22');
      grad.addColorStop(0.5, '#065f46');
      grad.addColorStop(1, '#059669');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 1024);

      // Cyber grid overlay
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.2)';
      ctx.lineWidth = 8;
      for (let x = 128; x < 1024; x += 128) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
      }
      for (let y = 128; y < 1024; y += 128) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
      }

      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 32;
      ctx.strokeRect(16, 16, 992, 992);
      break;
    }
    case 'amethyst_twilight': {
      const grad = ctx.createRadialGradient(512, 512, 100, 512, 512, 720);
      grad.addColorStop(0, '#9333ea');
      grad.addColorStop(0.6, '#581c87');
      grad.addColorStop(1, '#18042c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 1024);

      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 32;
      ctx.strokeRect(16, 16, 992, 992);
      break;
    }
    case 'frost_crystal': {
      const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
      grad.addColorStop(0, '#0c4a6e');
      grad.addColorStop(0.5, '#0284c7');
      grad.addColorStop(1, '#38bdf8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 1024);

      // Frost crystalline glimmers
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(64, 960); ctx.lineTo(360, 520); ctx.lineTo(720, 640); ctx.lineTo(960, 160);
      ctx.stroke();

      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 32;
      ctx.strokeRect(16, 16, 992, 992);
      break;
    }
    case 'golden_tycoon': {
      const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
      grad.addColorStop(0, '#78350f');
      grad.addColorStop(0.3, '#d97706');
      grad.addColorStop(0.5, '#fef08a');
      grad.addColorStop(0.7, '#f59e0b');
      grad.addColorStop(1, '#b45309');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 1024);

      // Gold beveled border
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 32;
      ctx.strokeRect(16, 16, 992, 992);
      break;
    }
    case 'magma_flame': {
      const grad = ctx.createRadialGradient(512, 512, 100, 512, 512, 720);
      grad.addColorStop(0, '#fdba74');
      grad.addColorStop(0.4, '#ea580c');
      grad.addColorStop(0.8, '#9a3412');
      grad.addColorStop(1, '#2c0b02');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 1024);

      // Fiery cracks
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.7)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(80, 120); ctx.lineTo(320, 400); ctx.lineTo(480, 280); ctx.lineTo(920, 840);
      ctx.stroke();

      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 32;
      ctx.strokeRect(16, 16, 992, 992);
      break;
    }
    case 'cosmic_void': {
      const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
      grad.addColorStop(0, '#030712');
      grad.addColorStop(0.35, '#1e1b4b');
      grad.addColorStop(0.7, '#4338ca');
      grad.addColorStop(1, '#c084fc');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 1024);

      // Distant stars
      ctx.fillStyle = '#ffffff';
      [
        [160, 200], [800, 180], [300, 800], [840, 760], [512, 120], [200, 500]
      ].forEach(([sx, sy]) => {
        ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();
      });

      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 32;
      ctx.strokeRect(16, 16, 992, 992);
      break;
    }
    case 'classic':
    default: {
      const grad = ctx.createRadialGradient(512, 512, 100, 512, 512, 720);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.75, '#f8fafc');
      grad.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 1024);

      // Subtle shadow border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 24;
      ctx.strokeRect(12, 12, 1000, 1000);
      break;
    }
  }

  // 2. Draw High-Detail Pips (Concave with 3D Bevel & Specular Core)
  const PIP_POSITIONS_HD = {
    1: [[512, 512]],
    2: [[288, 288], [736, 736]],
    3: [[288, 288], [512, 512], [736, 736]],
    4: [[288, 288], [736, 288], [288, 736], [736, 736]],
    5: [[288, 288], [736, 288], [512, 512], [288, 736], [736, 736]],
    6: [[288, 260], [736, 260], [288, 512], [736, 512], [288, 764], [736, 764]]
  };

  const pips = PIP_POSITIONS_HD[value] || [];
  const pipRadius = 78;

  pips.forEach(([x, y]) => {
    ctx.save();

    // 1. Drop shadow / Ambient occlusion ring around pip
    ctx.beginPath();
    ctx.arc(x, y + 5, pipRadius + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();

    // 2. Main Pip Body with rich 3D shading
    ctx.beginPath();
    ctx.arc(x, y, pipRadius, 0, Math.PI * 2);

    switch (skinId) {
      case 'neon_ruby': {
        const pGrad = ctx.createRadialGradient(x - 12, y - 12, 6, x, y, pipRadius);
        pGrad.addColorStop(0, '#ffffff');
        pGrad.addColorStop(0.3, '#fecdd3');
        pGrad.addColorStop(0.8, '#f43f5e');
        pGrad.addColorStop(1, '#9f1239');
        ctx.fillStyle = pGrad;
        ctx.fill();
        break;
      }
      case 'cyber_emerald': {
        const pGrad = ctx.createRadialGradient(x - 12, y - 12, 6, x, y, pipRadius);
        pGrad.addColorStop(0, '#ffffff');
        pGrad.addColorStop(0.4, '#a7f3d0');
        pGrad.addColorStop(0.8, '#10b981');
        pGrad.addColorStop(1, '#064e3b');
        ctx.fillStyle = pGrad;
        ctx.fill();
        break;
      }
      case 'amethyst_twilight': {
        const pGrad = ctx.createRadialGradient(x - 12, y - 12, 6, x, y, pipRadius);
        pGrad.addColorStop(0, '#ffffff');
        pGrad.addColorStop(0.4, '#e9d5ff');
        pGrad.addColorStop(0.8, '#a855f7');
        pGrad.addColorStop(1, '#581c87');
        ctx.fillStyle = pGrad;
        ctx.fill();
        break;
      }
      case 'frost_crystal': {
        const pGrad = ctx.createRadialGradient(x - 12, y - 12, 6, x, y, pipRadius);
        pGrad.addColorStop(0, '#ffffff');
        pGrad.addColorStop(0.4, '#e0f2fe');
        pGrad.addColorStop(0.8, '#0284c7');
        pGrad.addColorStop(1, '#075985');
        ctx.fillStyle = pGrad;
        ctx.fill();
        break;
      }
      case 'golden_tycoon': {
        const pGrad = ctx.createRadialGradient(x - 12, y - 12, 6, x, y, pipRadius);
        pGrad.addColorStop(0, '#ffffff');
        pGrad.addColorStop(0.3, '#fef08a');
        pGrad.addColorStop(0.7, '#eab308');
        pGrad.addColorStop(1, '#713f12');
        ctx.fillStyle = pGrad;
        ctx.fill();
        break;
      }
      case 'magma_flame': {
        const pGrad = ctx.createRadialGradient(x - 12, y - 12, 6, x, y, pipRadius);
        pGrad.addColorStop(0, '#ffffff');
        pGrad.addColorStop(0.3, '#fed7aa');
        pGrad.addColorStop(0.7, '#ea580c');
        pGrad.addColorStop(1, '#431407');
        ctx.fillStyle = pGrad;
        ctx.fill();
        break;
      }
      case 'cosmic_void': {
        const pGrad = ctx.createRadialGradient(x - 12, y - 12, 6, x, y, pipRadius);
        pGrad.addColorStop(0, '#ffffff');
        pGrad.addColorStop(0.4, '#ddd6fe');
        pGrad.addColorStop(0.8, '#7c3aed');
        pGrad.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = pGrad;
        ctx.fill();
        break;
      }
      case 'classic':
      default: {
        const pGrad = ctx.createRadialGradient(x - 14, y - 14, 4, x, y, pipRadius);
        pGrad.addColorStop(0, '#475569');
        pGrad.addColorStop(0.45, '#1e293b');
        pGrad.addColorStop(1, '#090d16');
        ctx.fillStyle = pGrad;
        ctx.fill();
        break;
      }
    }

    // 3. Specular white gloss dot for glass/acrylic shine
    ctx.beginPath();
    ctx.arc(x - pipRadius * 0.35, y - pipRadius * 0.35, pipRadius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fill();

    ctx.restore();
  });

  ctx.restore();
  textureCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * Generate 1024x1024 bump map texture with realistic concave spherical dimples for dots
 */
export function createDiceBumpCanvas(value) {
  const cacheKey = `bump_face_hd_${value}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Flat base level (white = highest surface)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1024, 1024);

  // Rounded edge bevel in bump map
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 36;
  ctx.strokeRect(18, 18, 988, 988);

  const PIP_POSITIONS_HD = {
    1: [[512, 512]],
    2: [[288, 288], [736, 736]],
    3: [[288, 288], [512, 512], [736, 736]],
    4: [[288, 288], [736, 288], [288, 736], [736, 736]],
    5: [[288, 288], [736, 288], [512, 512], [288, 736], [736, 736]],
    6: [[288, 260], [736, 260], [288, 512], [736, 512], [288, 764], [736, 764]]
  };

  const pips = PIP_POSITIONS_HD[value] || [];
  const pipRadius = 80;

  pips.forEach(([x, y]) => {
    // Parabolic concave indentation gradient
    const grad = ctx.createRadialGradient(x, y, 0, x, y, pipRadius);
    grad.addColorStop(0, '#000000');     // Deepest center pit
    grad.addColorStop(0.65, '#475569');  // Concave wall
    grad.addColorStop(0.9, '#cbd5e1');   // Rounded bevel rim
    grad.addColorStop(1, '#ffffff');     // Flat face surface
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, pipRadius, 0, Math.PI * 2);
    ctx.fill();
  });

  textureCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * Build a Three.js 3D Dice Mesh with rounded chamfered edges, engraved 3D pips and PBR materials
 */
export function create3DDiceMesh(skinId = 'classic', size = 2.15) {
  if (typeof THREE === 'undefined') return null;

  // High-poly BoxGeometry with subdivided segments for smooth edge rounding
  const segments = 14;
  const geometry = new THREE.BoxGeometry(size, size, size, segments, segments, segments);

  // Smooth Chamfer / Rounding of edges
  const pos = geometry.attributes.position;
  const half = size / 2;
  const r = size * 0.15; // corner curve radius
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const sx = Math.sign(v.x);
    const sy = Math.sign(v.y);
    const sz = Math.sign(v.z);
    const innerX = (half - r) * sx;
    const innerY = (half - r) * sy;
    const innerZ = (half - r) * sz;
    const dx = Math.max(0, Math.abs(v.x) - (half - r));
    const dy = Math.max(0, Math.abs(v.y) - (half - r));
    const dz = Math.max(0, Math.abs(v.z) - (half - r));
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 0 && (Math.abs(v.x) > half - r || Math.abs(v.y) > half - r || Math.abs(v.z) > half - r)) {
      const factor = Math.min(1.0, r / dist);
      v.x = innerX + dx * factor * sx;
      v.y = innerY + dy * factor * sy;
      v.z = innerZ + dz * factor * sz;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();

  // Box faces mapping in Three.js:
  // 0: Right  (+X) -> Face 3
  // 1: Left   (-X) -> Face 4
  // 2: Top    (+Y) -> Face 2
  // 3: Bottom (-Y) -> Face 5
  // 4: Front  (+Z) -> Face 1
  // 5: Back   (-Z) -> Face 6
  const faceValues = [3, 4, 2, 5, 1, 6];

  const materials = faceValues.map(val => {
    const canvas = createDiceFaceCanvas(val, skinId);
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;

    const bumpCanvas = createDiceBumpCanvas(val);
    const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
    bumpTexture.generateMipmaps = true;
    bumpTexture.minFilter = THREE.LinearMipmapLinearFilter;

    let matConfig = {
      map: texture,
      bumpMap: bumpTexture,
      bumpScale: 0.08,
      roughness: 0.14,
      metalness: 0.06
    };

    if (skinId === 'golden_tycoon') {
      matConfig.metalness = 0.94;
      matConfig.roughness = 0.12;
    } else if (skinId === 'neon_ruby' || skinId === 'cyber_emerald' || skinId === 'magma_flame' || skinId === 'cosmic_void' || skinId === 'amethyst_twilight') {
      matConfig.emissive = new THREE.Color(0.3, 0.3, 0.3);
      matConfig.emissiveMap = texture;
    }

    return new THREE.MeshStandardMaterial(matConfig);
  });

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Target rotations (radians) to expose a specific face upward (+Y)
 */
export function getTargetRotationForFace(value) {
  const v = parseInt(value) || 1;
  switch (v) {
    case 1: // Front (+Z) -> rotate down to Top (+Y)
      return { x: -Math.PI / 2, y: 0, z: 0 };
    case 2: // Top (+Y) -> already on Top
      return { x: 0, y: 0, z: 0 };
    case 3: // Right (+X) -> rotate left to Top (+Y)
      return { x: 0, y: 0, z: Math.PI / 2 };
    case 4: // Left (-X) -> rotate right to Top (+Y)
      return { x: 0, y: 0, z: -Math.PI / 2 };
    case 5: // Bottom (-Y) -> flip 180 to Top (+Y)
      return { x: Math.PI, y: 0, z: 0 };
    case 6: // Back (-Z) -> rotate up to Top (+Y)
      return { x: Math.PI / 2, y: 0, z: 0 };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

/**
 * Get Accent Light Color for Skin
 */
export function getSkinAccentColor(skinId = 'classic') {
  switch (skinId) {
    case 'neon_ruby': return 0xf43f5e;
    case 'cyber_emerald': return 0x10b981;
    case 'amethyst_twilight': return 0x7e22ce;
    case 'frost_crystal': return 0x38bdf8;
    case 'golden_tycoon': return 0xfbbf24;
    case 'magma_flame': return 0xea580c;
    case 'cosmic_void': return 0x818cf8;
    case 'classic':
    default: return 0xffffff;
  }
}

/**
 * Complete WebGL 3D Dice Stage Orchestrator
 */
export class WebGLDiceStage {
  constructor(containerId = 'dice-stage-3d-canvas') {
    this.containerId = containerId;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.die1Mesh = null;
    this.die2Mesh = null;
    this.accentLight = null;
    this.animFrameId = null;
    this.isRolling = false;
    this.currentSkin = 'classic';
  }

  init(width = 340, height = 130) {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js not found, fallback to CSS 3D');
      return false;
    }

    const container = document.getElementById(this.containerId);
    if (!container) return false;

    container.innerHTML = '';

    // 1. Scene
    this.scene = new THREE.Scene();

    // 2. Camera positioned with comfortable wide framing for large 2.15 dice
    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    this.camera.position.set(0, 8.4, 11.6);
    this.camera.lookAt(0, 0.65, 0);

    // 3. Renderer with transparent background & antialiasing
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 2, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 4. Lighting (Warm Key, Cool Rim, Soft Ambient, Dynamic Skin Accent)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(6, 14, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 30;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.85);
    rimLight.position.set(-7, 9, -5);
    this.scene.add(rimLight);

    this.accentLight = new THREE.PointLight(0xffffff, 1.2, 18);
    this.accentLight.position.set(0, 4.5, 2.5);
    this.scene.add(this.accentLight);

    // 5. Floor shadow receiver plane
    const planeGeo = new THREE.PlaneGeometry(32, 32);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.32 });
    const floor = new THREE.Mesh(planeGeo, planeMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 6. Build Initial Dice Meshes
    this.buildDice('classic', [1, 1]);

    // 7. Start render loop
    this.render();
    return true;
  }

  buildDice(skinId = 'classic', initialValues = [1, 1]) {
    if (!this.scene) return;
    this.currentSkin = skinId;

    if (this.die1Mesh) this.scene.remove(this.die1Mesh);
    if (this.die2Mesh) this.scene.remove(this.die2Mesh);

    if (this.accentLight) {
      this.accentLight.color.setHex(getSkinAccentColor(skinId));
      this.accentLight.intensity = skinId === 'classic' ? 0.5 : 1.35;
    }

    const diceSize = 2.15;
    this.die1Mesh = create3DDiceMesh(skinId, diceSize);
    this.die2Mesh = create3DDiceMesh(skinId, diceSize);

    if (!this.die1Mesh || !this.die2Mesh) return;

    this.die1Mesh.position.set(-1.75, 1.05, 0);
    this.die2Mesh.position.set(1.75, 1.05, 0);

    const r1 = getTargetRotationForFace(initialValues[0]);
    const r2 = getTargetRotationForFace(initialValues[1]);
    this.die1Mesh.rotation.set(r1.x, r1.y + 0.1, r1.z);
    this.die2Mesh.rotation.set(r2.x, r2.y - 0.1, r2.z);

    this.scene.add(this.die1Mesh);
    this.scene.add(this.die2Mesh);
  }

  roll(finalValues = [1, 1], skinId = null, onComplete = null) {
    if (!this.scene || !this.die1Mesh || !this.die2Mesh) {
      if (onComplete) onComplete();
      return;
    }

    const skin = skinId || this.currentSkin || 'classic';
    if (skin !== this.currentSkin) {
      this.buildDice(skin, finalValues);
    }

    this.isRolling = true;
    const startTime = performance.now();
    const duration = 750; // Total roll tumble time in ms

    // Target final rotations
    const tRot1 = getTargetRotationForFace(finalValues[0]);
    const tRot2 = getTargetRotationForFace(finalValues[1]);

    // Add multiple full 360-degree spins for realistic momentum
    const fullSpins1 = { x: Math.PI * 4, y: Math.PI * 6, z: Math.PI * 2 };
    const fullSpins2 = { x: -Math.PI * 6, y: -Math.PI * 4, z: -Math.PI * 2 };

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);

      // Smooth physics easing: fast burst, bounce, settle
      const easeOut = 1 - Math.pow(1 - progress, 3);

      if (progress < 1.0) {
        // Tumble in 3D space
        const tumbleProgress = (1 - easeOut);

        // Position arcs & bounce (kept strictly within visible camera frustum with safety margins)
        const jumpY1 = Math.sin(progress * Math.PI) * 1.15 * (1 - progress * 0.35);
        const jumpY2 = Math.sin(progress * Math.PI) * 1.25 * (1 - progress * 0.35);

        this.die1Mesh.position.set(
          -1.75 - Math.sin(progress * Math.PI * 2) * 0.32 * tumbleProgress,
          1.05 + Math.max(0, jumpY1),
          Math.cos(progress * Math.PI * 2) * 0.4 * tumbleProgress
        );

        this.die2Mesh.position.set(
          1.75 + Math.sin(progress * Math.PI * 2) * 0.32 * tumbleProgress,
          1.05 + Math.max(0, jumpY2),
          -Math.cos(progress * Math.PI * 2) * 0.4 * tumbleProgress
        );

        // Rotations
        this.die1Mesh.rotation.x = tRot1.x + fullSpins1.x * (1 - easeOut);
        this.die1Mesh.rotation.y = tRot1.y + fullSpins1.y * (1 - easeOut) + 0.1;
        this.die1Mesh.rotation.z = tRot1.z + fullSpins1.z * (1 - easeOut);

        this.die2Mesh.rotation.x = tRot2.x + fullSpins2.x * (1 - easeOut);
        this.die2Mesh.rotation.y = tRot2.y + fullSpins2.y * (1 - easeOut) - 0.1;
        this.die2Mesh.rotation.z = tRot2.z + fullSpins2.z * (1 - easeOut);

        this.animFrameId = requestAnimationFrame(animate);
      } else {
        // Land exactly on target values with tiny settle impact
        this.die1Mesh.position.set(-1.75, 1.05, 0);
        this.die2Mesh.position.set(1.75, 1.05, 0);

        this.die1Mesh.rotation.set(tRot1.x, tRot1.y + 0.08, tRot1.z);
        this.die2Mesh.rotation.set(tRot2.x, tRot2.y - 0.08, tRot2.z);

        this.isRolling = false;
        if (onComplete) onComplete();
      }
    };

    this.animFrameId = requestAnimationFrame(animate);
  }

  setDiceValues(values, skinId = null) {
    if (!this.die1Mesh || !this.die2Mesh) return;
    const skin = skinId || this.currentSkin || 'classic';
    if (skin !== this.currentSkin) {
      this.buildDice(skin, values);
    }
    const r1 = getTargetRotationForFace(values[0]);
    const r2 = getTargetRotationForFace(values[1]);
    this.die1Mesh.position.set(-1.75, 1.05, 0);
    this.die2Mesh.position.set(1.75, 1.05, 0);
    this.die1Mesh.rotation.set(r1.x, r1.y + 0.08, r1.z);
    this.die2Mesh.rotation.set(r2.x, r2.y - 0.08, r2.z);
  }

  render() {
    requestAnimationFrame(() => this.render());
    if (this.renderer && this.scene && this.camera) {
      // Subtle idle breathing when not rolling
      if (!this.isRolling && this.die1Mesh && this.die2Mesh) {
        const t = performance.now() * 0.0015;
        this.die1Mesh.position.y = 1.05 + Math.sin(t) * 0.035;
        this.die2Mesh.position.y = 1.05 + Math.cos(t) * 0.035;
      }
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.remove();
    }
  }
}

export const webGLDice = new WebGLDiceStage();
