const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('./db');
const { autoSetupLogs, sendLog } = require('./logger');

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('Show all security & moderation commands'),
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('setuplogs').setDescription('Auto-create all separate log channels'),
  new SlashCommandBuilder().setName('config').setDescription('View current server security settings'),
  new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Set custom prefix for this server')
    .addStringOption((o) => o.setName('prefix').setDescription('New prefix').setRequired(true).setMaxLength(5)),
  new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Customize Anti-Nuke punishment & limit')
    .addStringOption((o) =>
      o
        .setName('punishment')
        .setDescription('Punishment type')
        .setRequired(true)
        .addChoices(
          { name: 'Strip Roles', value: 'strip' },
          { name: 'Ban', value: 'ban' },
          { name: 'Kick', value: 'kick' }
        )
    )
    .addIntegerOption((o) => o.setName('limit').setDescription('Actions in 10s before trigger').setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName('antispam')
    .setDescription('Customize Anti-Spam message limit')
    .addIntegerOption((o) => o.setName('limit').setDescription('Max messages in 5s').setRequired(true).setMinValue(2).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName('altage')
    .setDescription('Set minimum account age (days) for alt alert')
    .addIntegerOption((o) => o.setName('days').setDescription('Minimum days').setRequired(true).setMinValue(1).setMaxValue(365)),
  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Toggle whitelist for a user or role')
    .addMentionableOption((o) => o.setName('target').setDescription('User or role').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ignorelog')
    .setDescription('Toggle log ignore for a channel or role')
    .addMentionableOption((o) => o.setName('target').setDescription('Channel or role').setRequired(true)),
  new SlashCommandBuilder().setName('lockdown').setDescription('Lock current channel'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock current channel'),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Bulk delete messages')
    .addIntegerOption((o) => o.setName('amount').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption((o) => o.setName('target').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a member')
    .addUserOption((o) => o.setName('target').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member')
    .addUserOption((o) => o.setName('target').setDescription('Member').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .addUserOption((o) => o.setName('target').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption((o) => o.setName('target').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),
].map((c) => c.toJSON());

function parseId(raw) {
  return raw?.replace(/[<@!&#>]/g, '');
}

async function runCommand(ctx, name, args) {
  const { guild, member, channel, reply } = ctx;
  const settings = db.getSettings(guild.id);

  if (name === 'ping') {
    return reply(`Pong! Latency: \`${guild.client.ws.ping}ms\``);
  }

  if (name === 'help') {
    const p = settings.prefix;
    const embed = new EmbedBuilder()
      .setTitle('🛡️ Security Bot Commands')
      .setColor(0x5865f2)
      .setDescription(`Current Prefix: \`${p}\` (Also supports \`/\` Slash Commands)`)
      .addFields(
        { name: '⚙️ Setup & Config', value: `\`setuplogs\`, \`config\`, \`setprefix <prefix>\`, \`antinuke <strip|ban|kick> [limit]\`, \`antispam <limit>\`, \`altage <days>\`` },
        { name: '🛡️ Whitelist & Logs', value: `\`whitelist <@user|@role>\`, \`ignorelog <#channel|@role>\`` },
        { name: '🔨 Moderation', value: `\`lockdown\`, \`unlock\`, \`clear <amount>\`, \`warn <@user> [reason]\`, \`warnings <@user>\`, \`timeout <@user> <min> [reason]\`, \`kick <@user> [reason]\`, \`ban <@user> [reason]\`` }
      );
    return reply({ embeds: [embed] });
  }

  const isAdminCmd = ['setuplogs', 'setprefix', 'antinuke', 'antispam', 'altage', 'whitelist', 'ignorelog', 'config'].includes(name);
  if (isAdminCmd && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return reply('❌ Administrator permission required.');
  }
  if (!isAdminCmd && !member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return reply('❌ Moderate Members permission required.');
  }

  if (name === 'setuplogs') {
    await reply('⏳ Setting up separate log channels...');
    const created = await autoSetupLogs(guild);
    return channel.send(
      `✅ Created log channels:\n• <#${created.security_channel}>\n• <#${created.mod_channel}>\n• <#${created.message_channel}>\n• <#${created.member_channel}>\n• <#${created.server_channel}>\n• <#${created.vc_channel}>`
    );
  }

  if (name === 'config') {
    const embed = new EmbedBuilder()
      .setTitle('⚙️ Server Security Config')
      .setColor(0x2ed573)
      .addFields(
        { name: 'Prefix', value: `\`${settings.prefix}\``, inline: true },
        { name: 'Anti-Nuke', value: `\`${settings.antinuke_punishment}\` (limit: ${settings.antinuke_limit}/10s)`, inline: true },
        { name: 'Anti-Spam', value: `${settings.antispam_limit} msgs / 5s`, inline: true },
        { name: 'Alt-Account Alert', value: `< ${settings.alt_age_days} days`, inline: true }
      );
    return reply({ embeds: [embed] });
  }

  if (name === 'setprefix') {
    const newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 5) return reply('❌ Provide a valid prefix (max 5 chars).');
    db.updateSetting(guild.id, 'prefix', newPrefix);
    return reply(`✅ Prefix updated to \`${newPrefix}\``);
  }

  if (name === 'antinuke') {
    const punishment = args[0]?.toLowerCase();
    if (!['strip', 'ban', 'kick'].includes(punishment)) {
      return reply('❌ Punishment must be `strip`, `ban`, or `kick`.');
    }
    db.updateSetting(guild.id, 'antinuke_punishment', punishment);
    if (args[1] && !isNaN(args[1])) {
      db.updateSetting(guild.id, 'antinuke_limit', Math.max(1, Math.min(20, Number(args[1]))));
    }
    return reply(`✅ Anti-Nuke updated: punishment = \`${punishment}\``);
  }

  if (name === 'antispam') {
    const limit = Number(args[0]);
    if (!limit || limit < 2 || limit > 20) return reply('❌ Limit must be between 2 and 20.');
    db.updateSetting(guild.id, 'antispam_limit', limit);
    return reply(`✅ Anti-Spam limit set to \`${limit}\` messages per 5s.`);
  }

  if (name === 'altage') {
    const days = Number(args[0]);
    if (!days || days < 1 || days > 365) return reply('❌ Days must be between 1 and 365.');
    db.updateSetting(guild.id, 'alt_age_days', days);
    return reply(`✅ Alt-Account alert threshold set to \`${days}\` day(s).`);
  }

  if (name === 'whitelist') {
    const id = parseId(args[0]);
    if (!id) return reply('❌ Mention a user or role.');
    const added = db.toggleWhitelist(guild.id, id, 'mention');
    return reply(added ? `✅ Added \`${id}\` to whitelist.` : `🗑️ Removed \`${id}\` from whitelist.`);
  }

  if (name === 'ignorelog') {
    const id = parseId(args[0]);
    if (!id) return reply('❌ Mention a channel or role.');
    const added = db.toggleLogIgnore(guild.id, id, 'mention');
    return reply(added ? `✅ Logs will now ignore \`${id}\`.` : `🗑️ Logs will no longer ignore \`${id}\`.`);
  }

  if (name === 'lockdown' || name === 'unlock') {
    const isLock = name === 'lockdown';
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: isLock ? false : null });
    await sendLog(guild, 'mod', {
      title: isLock ? '🔒 Channel Locked' : '🔓 Channel Unlocked',
      description: `<#${channel.id}> ${isLock ? 'locked' : 'unlocked'} by ${member.user.tag}.`,
      color: isLock ? 0xffa502 : 0x2ed573,
    });
    return reply(`Channel ${isLock ? 'locked 🔒' : 'unlocked 🔓'}.`);
  }

  if (name === 'clear') {
    const amount = Number(args[0]);
    if (!amount || amount < 1 || amount > 100) return reply('❌ Provide a number between 1 and 100.');
    const deleted = await channel.bulkDelete(amount, true).catch(() => null);
    return reply(deleted ? `🗑️ Deleted ${deleted.size} messages.` : '❌ Could not delete messages.');
  }

  const targetId = parseId(args[0]);
  const target = targetId ? await guild.members.fetch(targetId).catch(() => null) : null;
  if (!target) return reply('❌ Member not found.');

  if (name === 'warn') {
    const reason = args.slice(1).join(' ') || 'No reason provided';
    db.addWarning(guild.id, target.id, member.id, reason);
    await sendLog(guild, 'mod', {
      title: '⚠️ Member Warned',
      description: `**User:** ${target.user.tag}\n**Moderator:** ${member.user.tag}\n**Reason:** ${reason}`,
      color: 0xffa502,
    });
    return reply(`⚠️ Warned ${target.user.tag}: ${reason}`);
  }

  if (name === 'warnings') {
    const list = db.getWarnings(guild.id, target.id);
    if (list.length === 0) return reply(`${target.user.tag} has no warnings.`);
    const text = list.slice(0, 10).map((w, i) => `**${i + 1}.** ${w.reason} (by <@${w.moderator_id}>)`).join('\n');
    return reply({ embeds: [new EmbedBuilder().setTitle(`Warnings for ${target.user.tag}`).setDescription(text).setColor(0xffa502)] });
  }

  if (name === 'timeout') {
    const minutes = Number(args[1]);
    if (!minutes || minutes < 1) return reply('❌ Provide valid minutes.');
    const reason = args.slice(2).join(' ') || 'No reason provided';
    if (!target.moderatable) return reply('❌ Cannot timeout this user.');
    await target.timeout(minutes * 60 * 1000, reason);
    await sendLog(guild, 'mod', { title: '⏳ Member Timed Out', description: `${target.user.tag} for ${minutes}m. Reason: ${reason}`, color: 0xff4757 });
    return reply(`⏳ Timed out ${target.user.tag} for ${minutes}m.`);
  }

  if (name === 'kick') {
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target.kickable) return reply('❌ Cannot kick this user.');
    await target.kick(reason);
    await sendLog(guild, 'mod', { title: '👢 Member Kicked', description: `${target.user.tag}. Reason: ${reason}`, color: 0xff4757 });
    return reply(`👢 Kicked ${target.user.tag}.`);
  }

  if (name === 'ban') {
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target.bannable) return reply('❌ Cannot ban this user.');
    await target.ban({ reason });
    await sendLog(guild, 'mod', { title: '🔨 Member Banned', description: `${target.user.tag}. Reason: ${reason}`, color: 0xff0000 });
    return reply(`🔨 Banned ${target.user.tag}.`);
  }
}

module.exports = {
  slashCommands,
  runCommand,
};
