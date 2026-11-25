const { ChannelType, EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('./db');

const CHANNEL_KEYS = {
  security: 'security_channel',
  mod: 'mod_channel',
  message: 'message_channel',
  member: 'member_channel',
  server: 'server_channel',
  vc: 'vc_channel',
};

async function sendLog(guild, category, { title, description, color = 0x2f3136, fields = [] }) {
  const channels = db.getLogChannels(guild.id);
  const channelId = channels[CHANNEL_KEYS[category]] || channels.security_channel;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
  if (description) embed.setDescription(description.slice(0, 4000));
  if (fields.length > 0) embed.addFields(fields.slice(0, 25));

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function autoSetupLogs(guild) {
  const category = await guild.channels.create({
    name: '🔒 Security Logs',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
    ],
  });

  const defs = [
    { key: 'security_channel', name: 'security-alerts' },
    { key: 'mod_channel', name: 'mod-logs' },
    { key: 'message_channel', name: 'message-logs' },
    { key: 'member_channel', name: 'member-logs' },
    { key: 'server_channel', name: 'server-logs' },
    { key: 'vc_channel', name: 'vc-logs' },
  ];

  const created = {};
  for (const def of defs) {
    const ch = await guild.channels.create({
      name: def.name,
      type: ChannelType.GuildText,
      parent: category.id,
    });
    created[def.key] = ch.id;
  }

  db.setLogChannels(guild.id, created);
  return created;
}

module.exports = {
  sendLog,
  autoSetupLogs,
};
