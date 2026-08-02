import discord
from discord.ext import commands
import sqlite3
from datetime import datetime, timezone
import os
import logging

logging.basicConfig(level=logging.INFO)

intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)

TARGET_CHANNEL_IDS = {
    1496565527554822254,
    1510983249487462530,
    1533607231621435626,
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
    print(f"BOT ONLINE AS {bot.user}")
    init_ban_db()

@bot.event
async def on_message(message):
    if message.author.bot:
        return

    print(f"MESSAGE SEEN: guild={getattr(message.guild, 'id', None)} channel={message.channel.id} author={message.author}")

    if not message.guild:
        return

    if message.channel.id in TARGET_CHANNEL_IDS:
        print("TARGET CHANNEL HIT")

        me = message.guild.me or message.guild.get_member(bot.user.id)
        if me is None:
            print("BAN FAILED: bot member object not found")
            return

        print(f"BOT top role: {me.top_role} ({me.top_role.position})")
        print(f"USER top role: {message.author.top_role} ({message.author.top_role.position})")
        print(f"BOT ban_members: {me.guild_permissions.ban_members}")
        print(f"BOT administrator: {me.guild_permissions.administrator}")

        try:
            await message.guild.ban(message.author, reason="Spam channel rule")
            print(f"BANNED: {message.author}")

            track_ban(
                user_id=message.author.id,
                username=str(message.author),
                guild_id=message.guild.id,
                channel_id=message.channel.id,
                reason="Spam channel rule"
            )

        except discord.Forbidden as e:
            print(f"BAN FAILED: Forbidden: {e}")
        except discord.HTTPException as e:
            print(f"BAN FAILED: HTTPException: {e.status} {e.text}")
        except Exception as e:
            print(f"BAN FAILED: {type(e).__name__}: {e}")

    await bot.process_commands(message)

bot.run(os.environ["DISCORD_TOKEN"])
