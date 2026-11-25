const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const db = require('./db');
const { sendLog } = require('./logger');

const nukeTracker = new Map();
const spamTracker = new Map();

function isMemberWhitelisted(member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId || member.id === member.client.user.id) return true;
  const ids = [member.id, ...member.roles.cache.keys()];
  return db.isWhitelisted(member.guild.id, ids);
}

async function trackAntiNuke(guild, actionType, targetLabel) {
  const settings = db.getSettings(guild.id);
  const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: actionType }).catch(() => null);
  const entry = auditLogs?.entries.first();
  if (!entry || Date.now() - entry.createdTimestamp > 5000) return;

  const executor = entry.executor;
  if (!executor || executor.id === guild.client.user.id || executor.id === guild.ownerId) return;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (isMemberWhitelisted(member)) return;

  const key = `${guild.id}:${executor.id}`;
  const now = Date.now();
  const timestamps = (nukeTracker.get(key) || []).filter((ts) => now - ts < 10000);
  timestamps.push(now);
  nukeTracker.set(key, timestamps);

  if (timestamps.length >= settings.antinuke_limit) {
    nukeTracker.delete(key);
    const punishment = settings.antinuke_punishment;
    let outcome = 'No action taken (insufficient permissions)';

    if (member) {
      if (punishment === 'ban' && member.bannable) {
        await member.ban({ reason: `Anti-Nuke: Mass ${targetLabel}` }).catch(() => {});
        outcome = 'Banned';
      } else if (punishment === 'kick' && member.kickable) {
        await member.kick(`Anti-Nuke: Mass ${targetLabel}`).catch(() => {});
        outcome = 'Kicked';
      } else if (punishment === 'strip') {
        const removable = member.roles.cache.filter((r) => r.id !== guild.id && r.editable);
        await member.roles.remove(removable, `Anti-Nuke: Mass ${targetLabel}`).catch(() => {});
        outcome = 'Stripped all editable roles';
      }
    }

    await sendLog(guild, 'security', {
      title: '🚨 Anti-Nuke Triggered',
      description: `**Executor:** ${executor.tag} (\`${executor.id}\`)\n**Trigger:** Mass ${targetLabel}\n**Punishment:** ${outcome}`,
      color: 0xff0000,
    });
  }
}

async function handleMessageSecurity(message) {
  if (!message.guild || message.author.bot) return false;
  if (message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) return false;
  if (isMemberWhitelisted(message.member)) return false;

  const settings = db.getSettings(message.guild.id);

  if (settings.block_invites && /(discord\.gg|discord\.com\/invite)\//i.test(message.content)) {
    await message.delete().catch(() => {});
    await sendLog(message.guild, 'security', {
      title: '🛡️ Invite Link Blocked',
      description: `Deleted invite link from ${message.author.tag} in <#${message.channel.id}>.`,
      color: 0xffa502,
    });
    return true;
  }

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const timestamps = (spamTracker.get(key) || []).filter((ts) => now - ts < settings.antispam_window_ms);
  timestamps.push(now);
  spamTracker.set(key, timestamps);

  if (timestamps.length >= settings.antispam_limit) {
    spamTracker.delete(key);
    await message.delete().catch(() => {});
    if (message.member?.moderatable) {
      await message.member.timeout(60 * 1000, 'Auto-Mod: Spamming').catch(() => {});
    }
    await sendLog(message.guild, 'security', {
      title: '⚠️ Anti-Spam Triggered',
      description: `${message.author.tag} was timed out for 1m for spamming in <#${message.channel.id}>.`,
      color: 0xff4757,
    });
    return true;
  }

  return false;
}

async function checkAltAccount(member) {
  const settings = db.getSettings(member.guild.id);
  const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
  if (ageDays < settings.alt_age_days) {
    await sendLog(member.guild, 'security', {
      title: '🕵️ Alt Account Alert',
      description: `${member.user.tag} (\`${member.id}\`) joined with an account only **${ageDays} day(s)** old (threshold: ${settings.alt_age_days} days).`,
      color: 0xffa502,
    });
  }
}

module.exports = {
  AuditLogEvent,
  trackAntiNuke,
  handleMessageSecurity,
  checkAltAccount,
};
