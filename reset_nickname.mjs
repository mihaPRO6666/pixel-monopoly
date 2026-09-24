// Push "Hizuhara" as the current nickname to the cloud sync topic
const NTFY_TOPIC = 'pixel_monopoly_sync_1472673126859935765';
const now = Date.now();

const payload = {
  version: 1,
  userId: 'discord_1472673126859935765',
  discordId: '1472673126859935765',
  name: 'Hizuhara',
  customName: 'Hizuhara',
  theme: 'cyberpunk',
  timestamp: now
};

const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

if (res.ok) {
  console.log(`✅ Pushed nickname "Hizuhara" to cloud with timestamp: ${now}`);
  console.log('The old "SuperTester" will no longer be applied.');
} else {
  console.error(`❌ Failed: ${res.status} ${res.statusText}`);
}
