const {
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error('Missing DISCORD_TOKEN environment variable');
}

const TARGET_CHANNEL_IDS = new Set([
  '1496565527554822254',
  '1510983249487462530',
  '1533607231621435626'
]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

const db = new sqlite3.Database('./ban_tracker.db');

function initBanDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      guild_id TEXT,
      channel_id TEXT,
      reason TEXT,
      banned_at TEXT NOT NULL
    )
  `);
}

function trackBan(userId, username, guildId, channelId, reason) {
  db.run(
    `INSERT INTO bans (user_id, username, guild_id, channel_id, reason, banned_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(userId),
      username,
      String(guildId),
      String(channelId),
      reason,
      new Date().toISOString()
    ]
  );
}

client.once('ready', () => {
  console.log(`BOT ONLINE AS ${client.user.tag}`);
  initBanDb();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  console.log(
    `MESSAGE SEEN: guild=${message.guild.id} channel=${message.channel.id} author=${message.author.tag}`
  );

  if (!TARGET_CHANNEL_IDS.has(message.channel.id)) {
    console.log('IGNORED: CHANNEL NOT TARGETED');
    return;
  }

  console.log('TARGET CHANNEL HIT');

  try {
    const me = message.guild.members.me ?? await message.guild.members.fetchMe();
    const target = await message.guild.members.fetch(message.author.id).catch(() => null);

    if (!me) {
      console.log('BAN FAILED: bot member object not found');
      return;
    }

    if (!target) {
      console.log('BAN FAILED: target member object not found');
      return;
    }

    console.log(`BOT top role: ${me.roles.highest.name} (${me.roles.highest.position})`);
    console.log(`USER top role: ${target.roles.highest.name} (${target.roles.highest.position})`);
    console.log(`BOT ban_members: ${me.permissions.has(PermissionsBitField.Flags.BanMembers)}`);
    console.log(`BOT administrator: ${me.permissions.has(PermissionsBitField.Flags.Administrator)}`);
    console.log(`BOT can view channel: ${message.channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ViewChannel)}`);
    console.log(`BOT can read history: ${message.channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ReadMessageHistory)}`);

    if (target.id === message.guild.ownerId) {
      console.log('BAN FAILED: target is guild owner');
      return;
    }

    if (me.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
      console.log('BAN FAILED: bot role is not above target role');
      return;
    }

    if (
      !me.permissions.has(PermissionsBitField.Flags.BanMembers) &&
      !me.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      console.log('BAN FAILED: bot lacks ban permission');
      return;
    }

    await target.ban({ reason: 'Spam channel rule' });
    console.log(`BANNED: ${message.author.tag}`);

    trackBan(
      target.id,
      message.author.tag,
      message.guild.id,
      message.channel.id,
      'Spam channel rule'
    );
  } catch (error) {
    console.log(`BAN FAILED: ${error?.name || 'Error'}: ${error?.message || error}`);
  }
});

client.login(token);
