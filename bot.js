const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  Events
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
  `, (err) => {
    if (err) {
      console.error('DB INIT FAILED:', err);
    } else {
      console.log('DB READY');
    }
  });
}

function trackBan(userId, username, guildId, channelId, reason) {
  db.run(
    `INSERT INTO bans (user_id, username, guild_id, channel_id, reason, banned_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(userId),
      String(username),
      String(guildId),
      String(channelId),
      String(reason),
      new Date().toISOString()
    ],
    (err) => {
      if (err) {
        console.error('TRACK BAN FAILED:', err);
      } else {
        console.log(`TRACKED BAN: ${username} (${userId})`);
      }
    }
  );
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`READY AS ${readyClient.user.tag}`);
  initBanDb();

  try {
    const guilds = readyClient.guilds.cache.map(g => `${g.name} (${g.id})`);
    console.log('CONNECTED GUILDS:', guilds);
    console.log('TARGET CHANNEL IDS:', [...TARGET_CHANNEL_IDS]);
  } catch (err) {
    console.error('READY LOG FAILED:', err);
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    console.log('MESSAGE EVENT FIRED');
    console.log(`GUILD: ${message.guild ? `${message.guild.name} (${message.guild.id})` : 'DM'}`);
    console.log(`CHANNEL: ${message.channel.id}`);
    console.log(`AUTHOR: ${message.author.tag} (${message.author.id})`);
    console.log(`CONTENT: ${JSON.stringify(message.content)}`);

    if (!message.guild) {
      console.log('IGNORED: DM');
      return;
    }

    if (!TARGET_CHANNEL_IDS.has(message.channel.id)) {
      console.log('IGNORED: CHANNEL NOT TARGETED');
      return;
    }

    console.log('TARGET CHANNEL HIT');

    const me = message.guild.members.me ?? await message.guild.members.fetchMe();
    const target = await message.guild.members.fetch(message.author.id).catch(() => null);

    if (!me) {
      console.log('BAN FAILED: BOT MEMBER NOT FOUND');
      return;
    }

    if (!target) {
      console.log('BAN FAILED: TARGET MEMBER NOT FOUND');
      return;
    }

    const channelPerms = message.channel.permissionsFor(me);

    console.log(`BOT ROLE: ${me.roles.highest.name} (${me.roles.highest.position})`);
    console.log(`USER ROLE: ${target.roles.highest.name} (${target.roles.highest.position})`);
    console.log(`BOT CAN VIEW CHANNEL: ${channelPerms?.has(PermissionsBitField.Flags.ViewChannel)}`);
    console.log(`BOT CAN READ HISTORY: ${channelPerms?.has(PermissionsBitField.Flags.ReadMessageHistory)}`);
    console.log(`BOT CAN SEND: ${channelPerms?.has(PermissionsBitField.Flags.SendMessages)}`);
    console.log(`BOT BAN MEMBERS: ${me.permissions.has(PermissionsBitField.Flags.BanMembers)}`);
    console.log(`BOT ADMIN: ${me.permissions.has(PermissionsBitField.Flags.Administrator)}`);
    console.log(`ROLE COMPARISON: ${me.roles.highest.comparePositionTo(target.roles.highest)}`);
    console.log(`IS OWNER: ${target.id === message.guild.ownerId}`);

    if (target.id === message.guild.ownerId) {
      console.log('BAN FAILED: TARGET IS GUILD OWNER');
      return;
    }

    if (
      !me.permissions.has(PermissionsBitField.Flags.BanMembers) &&
      !me.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      console.log('BAN FAILED: BOT LACKS BAN PERMISSION');
      return;
    }

    if (!channelPerms?.has(PermissionsBitField.Flags.ViewChannel)) {
      console.log('BAN FAILED: BOT CANNOT VIEW CHANNEL');
      return;
    }

    if (me.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
      console.log('BAN FAILED: BOT ROLE NOT HIGHER THAN TARGET');
      return;
    }

    await target.ban({ reason: 'Spam channel rule' });
    console.log(`BANNED: ${target.user.tag}`);

    trackBan(
      target.id,
      target.user.tag,
      message.guild.id,
      message.channel.id,
      'Spam channel rule'
    );
  } catch (err) {
    console.error('MESSAGE HANDLER ERROR:', err);
  }
});

client.on('error', (err) => {
  console.error('CLIENT ERROR:', err);
});

client.on('warn', (info) => {
  console.warn('CLIENT WARN:', info);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

client.login(token);
