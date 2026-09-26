/**
 * Vercel Serverless Function — Discord Slash Command & Component Handler
 * Handles: /профиль, /история, and Interactive Pagination Buttons
 * Endpoint: POST /api/interactions
 */

import { webcrypto } from 'crypto';

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const NTFY_BASE = 'https://ntfy.sh/pixel_monopoly_sync_';
const HISTORY_URL = 'https://raw.githubusercontent.com/mihaPRO6666/pixel-monopoly/main/data/match-history.json';

const PAGE_SIZE = 10;
const MAX_PAGES = 10;

// Verify Discord request signature (ed25519)
async function verifySignature(rawBody, signature, timestamp) {
  try {
    const keyData = Buffer.from(PUBLIC_KEY, 'hex');
    const pubKey = await webcrypto.subtle.importKey('raw', keyData, { name: 'Ed25519' }, false, ['verify']);
    const msg = Buffer.from(timestamp + rawBody);
    const sig = Buffer.from(signature, 'hex');
    return await webcrypto.subtle.verify({ name: 'Ed25519' }, pubKey, sig, msg);
  } catch (e) {
    return false;
  }
}

// Fetch player game stats from ntfy cloud sync
async function fetchPlayerStats(discordId) {
  try {
    const res = await fetch(`${NTFY_BASE}${discordId}/json?since=all&limit=10`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.trim().split('\n').reverse()) {
      try {
        const msg = JSON.parse(line);
        const data = msg.message ? JSON.parse(msg.message) : null;
        if (data && (data.name || data.stats)) return data;
      } catch (e) {}
    }
    return null;
  } catch (e) { return null; }
}

// Fetch match history from GitHub
async function fetchHistory() {
  try {
    const res = await fetch(HISTORY_URL + '?t=' + Date.now(), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

function winRate(wins, games) {
  if (!games) return '0%';
  return `${Math.round((wins / games) * 100)}%`;
}

function timeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} д. назад`;
  if (hours > 0) return `${hours} ч. назад`;
  if (mins > 0) return `${mins} мин. назад`;
  return 'только что';
}

// Build Embed & ActionRow components for history page
function buildHistoryPage(matches, pageIndex = 0) {
  const totalMatches = matches.length;
  const totalPages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(totalMatches / PAGE_SIZE)));
  const page = Math.max(0, Math.min(pageIndex, totalPages - 1));

  const startIdx = page * PAGE_SIZE;
  const pageItems = matches.slice(startIdx, startIdx + PAGE_SIZE);

  const fields = pageItems.map((m, i) => {
    const globalIdx = startIdx + i + 1;
    const w = m.winner || { name: 'Никто', token: '❓', cash: 0 };
    const wName = w.discordId ? `<@${w.discordId}>` : `**${w.name}**`;
    const playerList = (m.players || [])
      .filter(p => !p.isBot)
      .map(p => {
        const userTag = p.discordId ? `<@${p.discordId}>` : p.name;
        if (p.hasLeft) return `${userTag} *(вышел ❌)*`;
        if (p.isBankrupt) return `${userTag} *(банкрот 💥)*`;
        return userTag;
      })
      .join(', ');

    const reasonLine = m.reason ? `⚠️ *${m.reason}*\n` : '';
    return {
      name: `#${globalIdx} · ${m.roomCode} · ${timeAgo(m.date)}`,
      value: `${reasonLine}👑 ${w.token} ${wName} — $${(w.cash || 0).toLocaleString('ru-RU')}\n👥 ${playerList || 'н/д'}`,
      inline: false
    };
  });

  const embed = {
    title: `📜 История матчей — Страница ${page + 1} из ${totalPages}`,
    description: `Всего сохранено **${totalMatches}** из **100** матчей (до 10 страниц по 10 игр)`,
    color: 0x6366f1,
    fields: fields.length ? fields : [{ name: '📭 Пусто', value: 'На этой странице пока нет игр.' }],
    footer: { text: `Страница ${page + 1}/${totalPages} • Pixel Monopoly` }
  };

  const components = [
    {
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2, // BUTTON
          style: 2, // SECONDARY
          label: '◀️ Назад',
          custom_id: `history_page_${page - 1}`,
          disabled: page <= 0
        },
        {
          type: 2, // BUTTON
          style: 1, // PRIMARY
          label: `${page + 1} / ${totalPages}`,
          custom_id: `history_cur_page`,
          disabled: true
        },
        {
          type: 2, // BUTTON
          style: 2, // SECONDARY
          label: 'Вперёд ▶️',
          custom_id: `history_page_${page + 1}`,
          disabled: page >= totalPages - 1
        }
      ]
    }
  ];

  return { embed, components };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp) return res.status(401).send('Missing signature headers');
  const isValid = await verifySignature(rawBody, signature, timestamp);
  if (!isValid) return res.status(401).send('Invalid signature');

  const interaction = req.body;

  // PING (Type 1)
  if (interaction.type === 1) return res.json({ type: 1 });

  // APPLICATION_COMMAND (Type 2)
  if (interaction.type === 2) {
    const commandName = interaction.data?.name;

    // ===== /профиль =====
    if (commandName === 'профиль') {
      const targetOpt = interaction.data?.options?.find(o => o.name === 'игрок');
      const targetUser = targetOpt
        ? interaction.data?.resolved?.users?.[targetOpt.value]
        : (interaction.member?.user || interaction.user);

      const userId = targetUser?.id;
      const globalName = targetUser?.global_name || targetUser?.username || 'Игрок';
      const avatarHash = targetUser?.avatar;
      const avatarUrl = avatarHash
        ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId || '0') % 6n)}.png`;

      const stats = userId ? await fetchPlayerStats(userId) : null;
      const wins = stats?.stats?.wins ?? stats?.wins ?? null;
      const games = stats?.stats?.gamesPlayed ?? stats?.games ?? null;
      const playerName = stats?.customName || stats?.name || globalName;
      const nameColorHex = (stats?.nameColor || stats?.color || '').replace('#', '');

      const cardImageUrl = `https://pixel-monopoly-nu.vercel.app/api/profile-card?userId=${userId}&name=${encodeURIComponent(playerName)}&discordTag=${encodeURIComponent(globalName)}&avatarUrl=${encodeURIComponent(avatarUrl)}&t=${Date.now()}`;

      const embed = {
        color: nameColorHex ? parseInt(nameColorHex, 16) : 0xf59e0b,
        image: {
          url: cardImageUrl
        }
      };

      const components = [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: '🎨 Персонализация',
              custom_id: `profile_gear_${userId}`
            },
            {
              type: 2,
              style: 5,
              label: '🎲 Играть в Монополию',
              url: 'https://pixel-monopoly-nu.vercel.app'
            }
          ]
        }
      ];

      return res.json({
        type: 4,
        data: { embeds: [embed], components }
      });
    }

    // ===== /история =====
    if (commandName === 'история') {
      const history = await fetchHistory();
      const matches = history?.matches || [];

      if (!matches.length) {
        return res.json({
          type: 4,
          data: { content: '📭 История матчей пока пуста. Сыграйте онлайн партию!', flags: 64 }
        });
      }

      const { embed, components } = buildHistoryPage(matches, 0);
      return res.json({
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: { embeds: [embed], components }
      });
    }

    return res.json({ type: 4, data: { content: '❓ Неизвестная команда', flags: 64 } });
  }

  // MESSAGE_COMPONENT (Type 3) — Button interactions
  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id || '';

    // History pagination
    if (customId.startsWith('history_page_')) {
      const pageNum = parseInt(customId.replace('history_page_', ''), 10) || 0;
      const history = await fetchHistory();
      const matches = history?.matches || [];

      const { embed, components } = buildHistoryPage(matches, pageNum);

      return res.json({
        type: 7, // UPDATE_MESSAGE
        data: { embeds: [embed], components }
      });
    }

    // Profile customization info button
    if (customId.startsWith('profile_gear_')) {
      const targetUserId = customId.replace('profile_gear_', '');
      const stats = targetUserId ? await fetchPlayerStats(targetUserId) : null;
      const token = stats?.token || 'Шляпа 🎩';
      const title = stats?.title || 'Создатель 🛠️';
      const diceSkin = stats?.diceSkin || 'Космическая пустота 🎲';
      const color = stats?.nameColor || stats?.color || 'Изумрудный 🟢';

      const gearEmbed = {
        title: '🎨 Экипировка и персонализация',
        description: `Текущие настройки персонализации игрока в **Pixel Monopoly**:`,
        color: 0xf59e0b,
        fields: [
          { name: '🎭 Фишка игрока', value: `\`${token}\``, inline: true },
          { name: '🏷️ Титул', value: `\`${title}\``, inline: true },
          { name: '🎲 Скин кубиков', value: `\`${diceSkin}\``, inline: true },
          { name: '🎨 Цвет ника', value: `\`${color}\``, inline: true },
          { name: '💰 Монеты профиля', value: `**${(stats?.coins || 0).toLocaleString('ru-RU')} 🪙**`, inline: true }
        ],
        footer: { text: 'Сменить скины можно в игре → Поменять профиль' }
      };

      return res.json({
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: { embeds: [gearEmbed], flags: 64 } // Ephemeral
      });
    }
  }

  return res.status(400).send('Unknown interaction type');
}
