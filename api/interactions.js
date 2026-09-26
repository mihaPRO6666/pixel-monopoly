/**
 * Vercel Serverless Function — Discord Slash Command Handler
 * Handles: /профиль, /история
 * Endpoint: POST /api/interactions
 */

import { webcrypto } from 'crypto';

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const NTFY_BASE = 'https://ntfy.sh/pixel_monopoly_sync_';
const HISTORY_URL = 'https://raw.githubusercontent.com/mihaPRO6666/pixel-monopoly/main/data/match-history.json';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp) return res.status(401).send('Missing signature headers');
  const isValid = await verifySignature(rawBody, signature, timestamp);
  if (!isValid) return res.status(401).send('Invalid signature');

  const interaction = req.body;

  // PING
  if (interaction.type === 1) return res.json({ type: 1 });

  // APPLICATION_COMMAND
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

      const embed = {
        title: `🎩 Профиль игрока`,
        color: nameColorHex ? parseInt(nameColorHex, 16) : 0x14b8a6,
        thumbnail: { url: avatarUrl },
        fields: [
          { name: '👤 Ник в игре', value: `**${playerName}**`, inline: true },
          { name: '🏆 Победы', value: wins !== null ? `**${wins}**` : '—', inline: true },
          { name: '🎲 Матчей', value: games !== null ? `**${games}**` : '—', inline: true },
          { name: '📈 Винрейт', value: (wins !== null && games !== null) ? `**${winRate(wins, games)}**` : '—', inline: true },
          { name: '🎮 Играть', value: '[Pixel Monopoly](https://pixel-monopoly-nu.vercel.app)', inline: true }
        ],
        footer: { text: 'Pixel Monopoly' }
      };

      return res.json({ type: 4, data: { embeds: [embed] } });
    }

    // ===== /история =====
    if (commandName === 'история') {
      const limit = 5;

      const history = await fetchHistory();
      const matches = history?.matches || [];

      if (!matches.length) {
        return res.json({
          type: 4,
          data: { content: '📭 История матчей пуста. Сыграйте партию!', flags: 64 }
        });
      }

      const recent = matches.slice(0, limit);
      const fields = recent.map((m, i) => {
        const w = m.winner;
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
          name: `#${i + 1} · ${m.roomCode} · ${timeAgo(m.date)}`,
          value: `${reasonLine}👑 ${w.token} ${wName} — $${(w.cash || 0).toLocaleString('ru-RU')}\n👥 ${playerList || 'н/д'}`,
          inline: false
        };
      });

      const embed = {
        title: `📜 История последних матчей`,
        color: 0x6366f1,
        fields,
        footer: { text: `Показаны последние ${recent.length} из ${matches.length} матчей • Pixel Monopoly` }
      };

      return res.json({ type: 4, data: { embeds: [embed] } });
    }

    return res.json({ type: 4, data: { content: '❓ Неизвестная команда', flags: 64 } });
  }

  return res.status(400).send('Unknown interaction type');
}
