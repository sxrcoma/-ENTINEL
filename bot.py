=import discord
from discord.ext import commands
import sqlite3
from datetime import datetime, timezone
import os
import logging

logging.basicConfig(level=logging.INFO)

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

TARGET_CHANNEL_IDS = {
    1496565527554822254,
    1510983249487462530,
    1533607231621435626
}

def init_ban_db():
    conn = sqlite3.connect("ban_tracker.db")
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            guild_id INTEGER,
            channel_id INTEGER,
            reason TEXT,
            banned_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

def track_ban(user_id, username, guild_id, channel_id, reason):
    conn = sqlite3.connect("ban_tracker.db")
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO bans (user_id, username, guild_id, channel_id, reason, banned_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        username,
        guild_id,
        channel_id,
        reason,
        datetime.now(timezone.utc).isoformat()
    ))
    conn.commit()
    conn.close()

@bot.event
async def on_ready():
    logging.info(f"BOT ONLINE AS {bot.user}")
    init_ban_db()

@bot.event
async def on_message(message):
    if message.author.bot:
        return

    if message.guild is None:
        return

    logging.info(
        f"MESSAGE SEEN guild={message.guild.id} channel={message.channel.id} "
        f"author={message.author} content={message.content!r}"
    )

    if message.channel.id not in TARGET_CHANNEL_IDS:
        return

    logging.info("TARGET CHANNEL HIT")

    me = message.guild.me or message.guild.get_member(bot.user.id)
    if me is None:
        logging.error("BAN FAILED: bot member object not found")
        return

    logging.info(f"BOT top role: {me.top_role} ({me.top_role.position})")
    logging.info(f"USER top role: {message.author.top_role} ({message.author.top_role.position})")
    logging.info(f"BOT ban_members: {me.guild_permissions.ban_members}")
    logging.info(f"BOT administrator: {me.guild_permissions.administrator}")
    logging.info(f"BOT role higher than user: {me.top_role > message.author.top_role}")
    logging.info(f"IS GUILD OWNER: {message.author.id == message.guild.owner_id}")

    if message.author.id == message.guild.owner_id:
        logging.error("BAN FAILED: target is server owner")
        return

    if me.top_role <= message.author.top_role:
        logging.error("BAN FAILED: bot role is not above target role")
        return

    if not me.guild_permissions.ban_members and not me.guild_permissions.administrator:
        logging.error("BAN FAILED: bot lacks ban_members permission")
        return

    try:
        await message.author.ban(reason="Spam channel rule")
        logging.info(f"BANNED: {message.author}")

        track_ban(
            user_id=message.author.id,
            username=str(message.author),
            guild_id=message.guild.id,
            channel_id=message.channel.id,
            reason="Spam channel rule"
        )

    except discord.Forbidden as e:
        logging.error(f"BAN FAILED: Forbidden: {e}")
    except discord.HTTPException as e:
        logging.error(f"BAN FAILED: HTTPException: {e.status} {e.text}")
    except Exception as e:
        logging.error(f"BAN FAILED: {type(e).__name__}: {e}")

    await bot.process_commands(message)

token = os.environ["DISCORD_TOKEN"]
bot.run(token)
Important note
