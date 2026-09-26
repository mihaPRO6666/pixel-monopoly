/**
 * Vercel Serverless Function — Dynamic Gaming Profile Card Generator (PNG)
 * GET /api/profile-card?userId=...&name=...&avatarUrl=...
 */

import { Resvg } from '@resvg/resvg-js';
import { ROBOTO_BOLD, ROBOTO_REGULAR } from './fonts-data.js';

const NTFY_BASE = 'https://ntfy.sh/pixel_monopoly_sync_';
const HISTORY_URL = 'https://raw.githubusercontent.com/mihaPRO6666/pixel-monopoly/main/data/match-history.json';

async function getPlayerFullData(userId, rawName) {
  const isOwner = userId === '1472673126859935765' || (rawName && rawName.toLowerCase().includes('hizuhara'));

  let stats = {
    wins: isOwner ? 2 : 0,
    games: isOwner ? 2 : 0,
    maxNetWorth: isOwner ? 3200 : 1500,
    losses: 0,
    title: isOwner ? 'Создатель' : 'Новичок',
    titleColor: isOwner ? '#f43f5e' : '#94a3b8',
    token: 'Шляпа 🎩',
    coins: isOwner ? 1500 : 100,
    nameColor: isOwner ? '#14b8a6' : '#38bdf8',
    diceSkin: isOwner ? 'Космос' : 'Классика',
    playerName: rawName || 'Игрок'
  };

  // 1. Calculate from persistent match history
  try {
    const histRes = await fetch(HISTORY_URL + '?t=' + Date.now(), { signal: AbortSignal.timeout(2000) });
    if (histRes.ok) {
      const histData = await histRes.json();
      const matches = histData?.matches || [];
      let matchWins = 0;
      let matchGames = 0;
      let matchLosses = 0;
      let highestNet = 1500;

      matches.forEach(m => {
        const found = (m.players || []).find(p =>
          (userId && p.discordId === userId) ||
          (rawName && p.name && p.name.toLowerCase() === rawName.toLowerCase())
        );
        if (found) {
          matchGames++;
          if (found.isWinner || (m.winner && (m.winner.discordId === userId || m.winner.name === rawName))) {
            matchWins++;
          }
          if (found.isBankrupt || found.hasLeft) {
            matchLosses++;
          }
          if ((found.netWorth || found.cash || 0) > highestNet) {
            highestNet = found.netWorth || found.cash || 0;
          }
          if (found.token) stats.token = found.token;
          if (found.name) stats.playerName = found.name;
        }
      });

      if (matchGames > 0) {
        stats.games = matchGames;
        stats.wins = matchWins;
        stats.losses = matchLosses;
        stats.maxNetWorth = highestNet;
      }
    }
  } catch (e) {
    console.warn('History read error in profile card:', e);
  }

  // 2. Fetch from ntfy cloud sync with poll=1 (instant)
  try {
    if (userId) {
      const ntfyRes = await fetch(`${NTFY_BASE}${userId}/json?poll=1&since=all`, {
        signal: AbortSignal.timeout(1500)
      });
      if (ntfyRes.ok) {
        const text = await ntfyRes.text();
        for (const line of text.trim().split('\n').reverse()) {
          try {
            const msg = JSON.parse(line);
            const data = msg.message ? JSON.parse(msg.message) : null;
            if (data) {
              if (data.coins !== undefined) stats.coins = data.coins;
              if (data.title) stats.title = data.title;
              if (data.nameColor) stats.nameColor = data.nameColor;
              if (data.token) stats.token = data.token;
              if (data.customName || data.name) stats.playerName = data.customName || data.name;
              if (data.diceSkin) stats.diceSkin = data.diceSkin;
              if (data.stats?.wins !== undefined) stats.wins = Math.max(stats.wins, data.stats.wins);
              if (data.stats?.gamesPlayed !== undefined) stats.games = Math.max(stats.games, data.stats.gamesPlayed);
              break;
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  // 3. Dynamic Title mapping & styling
  if (isOwner) {
    stats.title = 'Создатель';
    stats.titleColor = '#f43f5e';
    stats.nameColor = stats.nameColor || '#14b8a6';
  } else {
    if (stats.wins >= 10) {
      stats.title = 'Магнат';
      stats.titleColor = '#f59e0b';
    } else if (stats.wins >= 5) {
      stats.title = 'Монополист';
      stats.titleColor = '#a855f7';
    } else if (stats.wins >= 3) {
      stats.title = 'Акула бизнеса';
      stats.titleColor = '#38bdf8';
    } else {
      stats.title = 'Новичок';
      stats.titleColor = '#94a3b8';
    }
  }

  return stats;
}

async function fetchAvatarBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mime = res.headers.get('content-type') || 'image/png';
    return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
  } catch (e) { return null; }
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function generateProfileCard({ userId, name = 'Hizuhara', avatarUrl, discordTag = 'Hizuhara', color = '#14b8a6' }) {
  // Fetch player stats and avatar in parallel
  const [playerData, avatarBase64] = await Promise.all([
    getPlayerFullData(userId, name),
    avatarUrl ? fetchAvatarBase64(avatarUrl) : null
  ]);

  const wins = playerData.wins;
  const games = playerData.games;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
  const coins = playerData.coins;
  const title = playerData.title;
  const diceSkin = playerData.diceSkin;
  const tokenName = playerData.token;
  const playerName = escapeXml(playerData.playerName || name);
  const userColor = playerData.nameColor || color || '#14b8a6';
  const titleColor = playerData.titleColor || '#f43f5e';
  const maxNetWorth = playerData.maxNetWorth || 1500;
  const losses = playerData.losses || Math.max(0, games - wins);

  const width = 900;
  const height = 540;

  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradients -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#050811" />
    </linearGradient>
    <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="50%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#d97706" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#78350f" stop-opacity="0.05" />
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.9" />
    </linearGradient>
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#fbbf24" />
    </linearGradient>
    <clipPath id="avatarClip">
      <rect x="28" y="28" width="84" height="84" rx="14" />
    </clipPath>
  </defs>

  <!-- Outer Card Frame -->
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="20" fill="url(#bgGrad)" stroke="url(#goldBorder)" stroke-width="3"/>
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="16" fill="none" stroke="#f59e0b" stroke-opacity="0.25" stroke-width="1"/>

  <!-- Subtle Grid Overlay -->
  <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#334155" stroke-opacity="0.15" stroke-width="1"/>
  </pattern>
  <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="14" fill="url(#grid)"/>

  <!-- ================= HEADER SECTION ================= -->
  <rect x="20" y="20" width="${width - 40}" height="100" rx="14" fill="url(#headerGrad)" stroke="#f59e0b" stroke-opacity="0.4" stroke-width="1"/>

  <!-- Avatar Box -->
  <rect x="26" y="26" width="88" height="88" rx="16" fill="#0f172a" stroke="url(#goldBorder)" stroke-width="2"/>
  ${avatarBase64 ? `
    <image x="28" y="28" width="84" height="84" href="${avatarBase64}" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>
  ` : `
    <text x="70" y="76" text-anchor="middle" fill="#f59e0b" font-size="28" font-family="Roboto" font-weight="bold">VIP</text>
  `}
  <!-- Avatar Level Badge -->
  <rect x="36" y="96" width="68" height="18" rx="6" fill="#f59e0b"/>
  <text x="70" y="109" text-anchor="middle" fill="#000000" font-size="11" font-family="Roboto" font-weight="bold">PRO VIP</text>

  <!-- User Identity Info -->
  <text x="130" y="58" fill="${userColor}" font-size="28" font-family="Roboto" font-weight="bold">${playerName}</text>

  <!-- Title Badge (e.g. [ Создатель ]) -->
  <rect x="130" y="70" width="130" height="22" rx="6" fill="${titleColor}" fill-opacity="0.2" stroke="${titleColor}" stroke-width="1"/>
  <text x="195" y="85" text-anchor="middle" fill="${titleColor}" font-size="12" font-family="Roboto" font-weight="bold">[ ${escapeXml(title)} ]</text>

  <!-- Discord Tag Badge -->
  <rect x="268" y="70" width="130" height="22" rx="6" fill="#5865f2" fill-opacity="0.2" stroke="#5865f2" stroke-width="1"/>
  <text x="333" y="85" text-anchor="middle" fill="#c7d2fe" font-size="12" font-family="Roboto">@${escapeXml(discordTag)}</text>

  <!-- Header Right Stats Pill -->
  <g transform="translate(${width - 240}, 35)">
    <rect x="0" y="0" width="210" height="70" rx="12" fill="#0f172a" fill-opacity="0.8" stroke="#f59e0b" stroke-opacity="0.5" stroke-width="1"/>
    <text x="15" y="26" fill="#94a3b8" font-size="11" font-family="Roboto" font-weight="bold">СТАТУС ИГРОКА</text>
    <text x="15" y="52" fill="#fbbf24" font-size="20" font-family="Roboto" font-weight="bold">${winRate >= 50 ? 'ЧЕМПИОН ⭐' : 'ИГРОК 🎲'}</text>
    <text x="195" y="48" text-anchor="end" fill="#10b981" font-size="12" font-family="Roboto" font-weight="bold">ONLINE</text>
    <circle cx="132" cy="44" r="4" fill="#10b981"/>
  </g>

  <!-- ================= 4 TOP STAT CARDS ================= -->
  <!-- Card 1: ПОБЕДЫ -->
  <g transform="translate(20, 130)">
    <rect width="205" height="75" rx="10" fill="url(#cardGrad)" stroke="#f59e0b" stroke-opacity="0.4" stroke-width="1.5"/>
    <text x="15" y="24" fill="#fbbf24" font-size="11" font-family="Roboto" font-weight="bold" letter-spacing="1">ПОБЕДЫ</text>
    <text x="15" y="56" fill="#ffffff" font-size="28" font-family="Roboto" font-weight="bold">${wins}</text>
    <text x="190" y="54" text-anchor="end" fill="#10b981" font-size="12" font-family="Roboto" font-weight="bold">ТОП 1</text>
  </g>

  <!-- Card 2: МАТЧИ -->
  <g transform="translate(235, 130)">
    <rect width="205" height="75" rx="10" fill="url(#cardGrad)" stroke="#f59e0b" stroke-opacity="0.4" stroke-width="1.5"/>
    <text x="15" y="24" fill="#60a5fa" font-size="11" font-family="Roboto" font-weight="bold" letter-spacing="1">МАТЧИ</text>
    <text x="15" y="56" fill="#ffffff" font-size="28" font-family="Roboto" font-weight="bold">${games}</text>
    <text x="190" y="54" text-anchor="end" fill="#94a3b8" font-size="12" font-family="Roboto">сыграно</text>
  </g>

  <!-- Card 3: ВИНРЕЙТ -->
  <g transform="translate(450, 130)">
    <rect width="205" height="75" rx="10" fill="url(#cardGrad)" stroke="#f59e0b" stroke-opacity="0.4" stroke-width="1.5"/>
    <text x="15" y="24" fill="#34d399" font-size="11" font-family="Roboto" font-weight="bold" letter-spacing="1">ВИНРЕЙТ</text>
    <text x="15" y="56" fill="#10b981" font-size="28" font-family="Roboto" font-weight="bold">${winRate}%</text>
    <text x="190" y="54" text-anchor="end" fill="#34d399" font-size="12" font-family="Roboto">эффект.</text>
  </g>

  <!-- Card 4: МОНЕТЫ -->
  <g transform="translate(665, 130)">
    <rect width="215" height="75" rx="10" fill="url(#cardGrad)" stroke="#f59e0b" stroke-opacity="0.4" stroke-width="1.5"/>
    <text x="15" y="24" fill="#f43f5e" font-size="11" font-family="Roboto" font-weight="bold" letter-spacing="1">МОНЕТЫ</text>
    <text x="15" y="56" fill="#fbbf24" font-size="28" font-family="Roboto" font-weight="bold">${coins.toLocaleString('ru-RU')}</text>
    <text x="200" y="54" text-anchor="end" fill="#f59e0b" font-size="12" font-family="Roboto">баланс</text>
  </g>

  <!-- ================= TWO LOWER DATA PANELS ================= -->
  <!-- Left Box: ИГРОВАЯ СТАТИСТИКА -->
  <g transform="translate(20, 215)">
    <rect width="420" height="270" rx="12" fill="url(#cardGrad)" stroke="#f59e0b" stroke-opacity="0.35" stroke-width="1"/>
    <!-- Panel Header Bar -->
    <rect x="0" y="0" width="420" height="34" rx="12" fill="#d97706" fill-opacity="0.25"/>
    <text x="15" y="22" fill="#fbbf24" font-size="12" font-family="Roboto" font-weight="bold" letter-spacing="1">БОЕВАЯ СТАТИСТИКА И РЕЗУЛЬТАТЫ</text>

    <!-- Row 1 -->
    <text x="18" y="65" fill="#94a3b8" font-size="13" font-family="Roboto">Процент побед (Winrate)</text>
    <text x="390" y="65" text-anchor="end" fill="#10b981" font-size="14" font-family="Roboto" font-weight="bold">${winRate}%</text>
    <line x1="18" y1="78" x2="390" y2="78" stroke="#334155" stroke-width="0.8"/>

    <!-- Row 2 -->
    <text x="18" y="105" fill="#94a3b8" font-size="13" font-family="Roboto">Всего побед</text>
    <text x="390" y="105" text-anchor="end" fill="#f1f5f9" font-size="14" font-family="Roboto" font-weight="bold">${wins} матчей</text>
    <line x1="18" y1="118" x2="390" y2="118" stroke="#334155" stroke-width="0.8"/>

    <!-- Row 3 -->
    <text x="18" y="145" fill="#94a3b8" font-size="13" font-family="Roboto">Рекордный капитал за игру</text>
    <text x="390" y="145" text-anchor="end" fill="#fbbf24" font-size="14" font-family="Roboto" font-weight="bold">$${maxNetWorth.toLocaleString('ru-RU')}</text>
    <line x1="18" y1="158" x2="390" y2="158" stroke="#334155" stroke-width="0.8"/>

    <!-- Row 4 -->
    <text x="18" y="185" fill="#94a3b8" font-size="13" font-family="Roboto">Поражений / Выходов</text>
    <text x="390" y="185" text-anchor="end" fill="#f87171" font-size="14" font-family="Roboto" font-weight="bold">${losses}</text>
    <line x1="18" y1="198" x2="390" y2="198" stroke="#334155" stroke-width="0.8"/>

    <!-- Row 5 -->
    <text x="18" y="225" fill="#94a3b8" font-size="13" font-family="Roboto">Ранг на сервере</text>
    <text x="390" y="225" text-anchor="end" fill="#38bdf8" font-size="14" font-family="Roboto" font-weight="bold">${wins > 0 ? '#1 Лидер' : 'Участник'}</text>
    <line x1="18" y1="238" x2="390" y2="238" stroke="#334155" stroke-width="0.8"/>

    <!-- Mini Progress Bar -->
    <text x="18" y="258" fill="#64748b" font-size="11" font-family="Roboto">ПРОГРЕСС ВИНРЕЙТА</text>
    <rect x="160" y="248" width="230" height="12" rx="6" fill="#1e293b"/>
    <rect x="160" y="248" width="${Math.max(4, Math.round(230 * (winRate / 100)))}" height="12" rx="6" fill="url(#barGrad)"/>
  </g>

  <!-- Right Box: ПЕРСОНАЛИЗАЦИЯ И ИНВЕНТАРЬ -->
  <g transform="translate(460, 215)">
    <rect width="420" height="270" rx="12" fill="url(#cardGrad)" stroke="#f59e0b" stroke-opacity="0.35" stroke-width="1"/>
    <!-- Panel Header Bar -->
    <rect x="0" y="0" width="420" height="34" rx="12" fill="#d97706" fill-opacity="0.25"/>
    <text x="15" y="22" fill="#fbbf24" font-size="12" font-family="Roboto" font-weight="bold" letter-spacing="1">ПЕРСОНАЛИЗАЦИЯ И ЭКИПИРОВКА</text>

    <!-- Item 1 -->
    <text x="18" y="65" fill="#94a3b8" font-size="13" font-family="Roboto">Фишка игрока</text>
    <text x="390" y="65" text-anchor="end" fill="#38bdf8" font-size="14" font-family="Roboto" font-weight="bold">${escapeXml(tokenName)}</text>
    <line x1="18" y1="78" x2="390" y2="78" stroke="#334155" stroke-width="0.8"/>

    <!-- Item 2 -->
    <text x="18" y="105" fill="#94a3b8" font-size="13" font-family="Roboto">Титул профиля</text>
    <text x="390" y="105" text-anchor="end" fill="${titleColor}" font-size="14" font-family="Roboto" font-weight="bold">${escapeXml(title)}</text>
    <line x1="18" y1="118" x2="390" y2="118" stroke="#334155" stroke-width="0.8"/>

    <!-- Item 3 -->
    <text x="18" y="145" fill="#94a3b8" font-size="13" font-family="Roboto">Скин 3D кубиков</text>
    <text x="390" y="145" text-anchor="end" fill="#a855f7" font-size="14" font-family="Roboto" font-weight="bold">${escapeXml(diceSkin)}</text>
    <line x1="18" y1="158" x2="390" y2="158" stroke="#334155" stroke-width="0.8"/>

    <!-- Item 4 -->
    <text x="18" y="185" fill="#94a3b8" font-size="13" font-family="Roboto">Цвет ника и темы</text>
    <text x="390" y="185" text-anchor="end" fill="${userColor}" font-size="14" font-family="Roboto" font-weight="bold">Изумрудный</text>
    <line x1="18" y1="198" x2="390" y2="198" stroke="#334155" stroke-width="0.8"/>

    <!-- Item 5 -->
    <text x="18" y="225" fill="#94a3b8" font-size="13" font-family="Roboto">Монеты в банке</text>
    <text x="390" y="225" text-anchor="end" fill="#fbbf24" font-size="14" font-family="Roboto" font-weight="bold">${coins.toLocaleString('ru-RU')} монет</text>
    <line x1="18" y1="238" x2="390" y2="238" stroke="#334155" stroke-width="0.8"/>

    <!-- Footer Note inside panel -->
    <text x="210" y="258" text-anchor="middle" fill="#64748b" font-size="11" font-family="Roboto">Синхронизировано с игрой Pixel Monopoly</text>
  </g>

  <!-- ================= FOOTER ================= -->
  <text x="30" y="515" fill="#64748b" font-size="11" font-family="Roboto">PIXEL MONOPOLY ONLINE • 2026</text>
  <text x="${width - 30}" y="515" text-anchor="end" fill="#d97706" font-size="11" font-family="Roboto" font-weight="bold">pixel-monopoly-nu.vercel.app</text>
</svg>
  `;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      fontBuffers: [ROBOTO_BOLD, ROBOTO_REGULAR],
      defaultFontFamily: 'Roboto',
      loadSystemFonts: false
    }
  });

  return resvg.render().asPng();
}

export default async function handler(req, res) {
  try {
    const pngBuffer = await generateProfileCard(req.query || {});
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10');
    return res.status(200).send(pngBuffer);
  } catch (err) {
    console.error('Profile card render error:', err);
    return res.status(500).json({ error: 'Render error', details: err.message });
  }
}
