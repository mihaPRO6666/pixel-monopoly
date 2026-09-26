/**
 * Vercel Serverless Function — Discord Slash Command Handler
 * Handles /профиль slash command
 * Endpoint: POST /api/interactions
 */

import { webcrypto } from 'crypto';

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const NTFY_BASE = 'https://ntfy.sh/pixel_monopoly_sync_';

// Verify Discord request signature (ed25519)
async function verifySignature(rawBody, signature, timestamp) {
  try {
    const keyData = Buffer.from(PUBLIC_KEY, 'hex');
    const pubKey = await webcrypto.subtle.importKey(
      'raw', keyData, { name: 'Ed25519' }, false, ['verify']
    );
    const msg = Buffer.from(timestamp + rawBody);
    const sig = Buffer.from(signature, 'hex');
    return await webcrypto.subtle.verify({ name: 'Ed25519' }, pubKey, sig, msg);
  } catch (e) {
    console.error('Signature verification error:', e);
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
    const lines = text.trim().split('\n').filter(Boolean);
    if (!lines.length) return null;

    // Parse JSONL from ntfy, find latest game sync message
    let latest = null;
    for (const line of lines.reverse()) {
      try {
        const msg = JSON.parse(line);
        if (msg.message) {
          const data = JSON.parse(msg.message);
          if (data && (data.name || data.stats)) {
            latest = data;
            break;
          }
        }
      } catch (e) {}
    }
    return latest;
  } catch (e) {
    return null;
  }
}

function formatWinRate(wins, games) {
  if (!games) return '0%';
  return `${Math.round((wins / games) * 100)}%`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Get raw body for signature verification
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).send('Missing signature headers');
  }

  const isValid = await verifySignature(rawBody, signature, timestamp);
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  const interaction = req.body;

  // Type 1 = PING (Discord verification)
  if (interaction.type === 1) {
    return res.json({ type: 1 });
  }

  // Type 2 = APPLICATION_COMMAND (slash command)
  if (interaction.type === 2) {
    const commandName = interaction.data?.name;

    if (commandName === 'профиль') {
      // Get target user: either the option user, or the command invoker
      const targetUserOption = interaction.data?.options?.find(o => o.name === 'игрок');
      const targetUser = targetUserOption
        ? interaction.data?.resolved?.users?.[targetUserOption.value]
        : (interaction.member?.user || interaction.user);

      const userId = targetUser?.id;
      const username = targetUser?.username || 'Неизвестный';
      const globalName = targetUser?.global_name || username;
      const avatarHash = targetUser?.avatar;
      const avatarUrl = avatarHash
        ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${(parseInt(userId || '0') >> 22) % 6}.png`;

      // Try to get game stats from ntfy cloud sync
      const stats = userId ? await fetchPlayerStats(userId) : null;
      const wins = stats?.stats?.wins ?? stats?.wins ?? null;
      const games = stats?.stats?.gamesPlayed ?? stats?.games ?? null;
      const playerName = stats?.name || stats?.customName || globalName;
      const nameColor = stats?.nameColor || stats?.color || null;

      const embed = {
        title: `🎩 Профиль игрока`,
        color: nameColor ? parseInt(nameColor.replace('#', ''), 16) : 0x14b8a6,
        thumbnail: { url: avatarUrl },
        fields: [
          {
            name: '👤 Ник',
            value: playerName,
            inline: true
          },
          {
            name: '🏆 Победы',
            value: wins !== null ? `**${wins}**` : '—',
            inline: true
          },
          {
            name: '🎲 Матчей',
            value: games !== null ? `**${games}**` : '—',
            inline: true
          },
          {
            name: '📈 Винрейт',
            value: (wins !== null && games !== null) ? `**${formatWinRate(wins, games)}**` : '—',
            inline: true
          },
          {
            name: '🎮 Игра',
            value: '[Pixel Monopoly](https://pixel-monopoly-nu.vercel.app)',
            inline: true
          }
        ],
        footer: { text: 'Pixel Monopoly • pixel-monopoly-nu.vercel.app' }
      };

      // Deferred response with embed
      return res.json({
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: { embeds: [embed] }
      });
    }

    // Unknown command
    return res.json({
      type: 4,
      data: { content: '❓ Неизвестная команда', flags: 64 }
    });
  }

  return res.status(400).send('Unknown interaction type');
}
