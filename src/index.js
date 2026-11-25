require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const db = require('./db');
const { sendLog } = require('./logger');
const { AuditLogEvent, trackAntiNuke, handleMessageSecurity, checkAltAccount } = require('./security');
const { slashCommands, runCommand } = require('./commands');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('Slash commands registered globally.');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

// Prefix commands + Anti-Spam / Auto-Mod
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const blocked = await handleMessageSecurity(message);
  if (blocked) return;

  const settings = db.getSettings(message.guild.id);
  if (!message.content.startsWith(settings.prefix)) return;

  const parts = message.content.slice(settings.prefix.length).trim().split(/\s+/);
  const name = parts.shift()?.toLowerCase();
  if (!name) return;

  await runCommand(
    {
      guild: message.guild,
      member: message.member,
      channel: message.channel,
      reply: (payload) => message.reply(payload),
    },
    name,
    parts
  ).catch((err) => console.error('Prefix command error:', err));
});

// Slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;

  const args = [];
  for (const opt of interaction.options.data) {
    args.push(String(opt.value));
  }

  await runCommand(
    {
      guild: interaction.guild,
      member: interaction.member,
      channel: interaction.channel,
      reply: (payload) =>
        interaction.replied || interaction.deferred
          ? interaction.followUp(payload)
          : interaction.reply(payload),
    },
    interaction.commandName,
    args
  ).catch((err) => console.error('Slash command error:', err));
});

// Message Delete & Edit Logs
client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  const ignoreIds = [message.channel.id, ...(message.member?.roles.cache.keys() || [])];
  if (db.isLogIgnored(message.guild.id, ignoreIds)) return;

  const attachments = message.attachments?.map((a) => a.url).join('\n') || 'None';
  await sendLog(message.guild, 'message', {
    title: '🗑️ Message Deleted',
    description: `**Author:** ${message.author?.tag || 'Unknown'}\n**Channel:** <#${message.channel.id}>\n**Content:** ${message.content || '*No text*'}\n**Attachments:** ${attachments}`,
    color: 0xff4757,
  });
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot || oldMsg.content === newMsg.content) return;
  const ignoreIds = [newMsg.channel.id, ...(newMsg.member?.roles.cache.keys() || [])];
  if (db.isLogIgnored(newMsg.guild.id, ignoreIds)) return;

  await sendLog(newMsg.guild, 'message', {
    title: '✏️ Message Edited',
    description: `**Author:** ${newMsg.author.tag}\n**Channel:** <#${newMsg.channel.id}>\n**Before:** ${oldMsg.content || '*Empty*'}\n**After:** ${newMsg.content || '*Empty*'}`,
    color: 0xffa502,
  });
});

// Member Join & Leave Logs + Alt Check
client.on('guildMemberAdd', async (member) => {
  await checkAltAccount(member);
  await sendLog(member.guild, 'member', {
    title: '📥 Member Joined',
    description: `${member.user.tag} (\`${member.id}\`) joined the server.`,
    color: 0x2ed573,
  });
});

client.on('guildMemberRemove', async (member) => {
  await sendLog(member.guild, 'member', {
    title: '📤 Member Left',
    description: `${member.user.tag} (\`${member.id}\`) left the server.`,
    color: 0xff4757,
  });
});

// Voice Channel (VC) Logs
client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  if (!oldState.channelId && newState.channelId) {
    await sendLog(member.guild, 'vc', {
      title: '🔊 VC Joined',
      description: `${member.user.tag} joined <#${newState.channelId}>`,
      color: 0x2ed573,
    });
  } else if (oldState.channelId && !newState.channelId) {
    await sendLog(member.guild, 'vc', {
      title: '🔇 VC Left',
      description: `${member.user.tag} left <#${oldState.channelId}>`,
      color: 0xff4757,
    });
  } else if (oldState.channelId !== newState.channelId) {
    await sendLog(member.guild, 'vc', {
      title: '🔀 VC Moved',
      description: `${member.user.tag} moved from <#${oldState.channelId}> to <#${newState.channelId}>`,
      color: 0x5865f2,
    });
  }
});

// Server Logs & Anti-Nuke Triggers
client.on('channelCreate', async (channel) => {
  if (!channel.guild) return;
  await sendLog(channel.guild, 'server', { title: '📁 Channel Created', description: `${channel.name} (\`${channel.id}\`)`, color: 0x2ed573 });
  await trackAntiNuke(channel.guild, AuditLogEvent.ChannelCreate, 'Channel Create');
});

client.on('channelDelete', async (channel) => {
  if (!channel.guild) return;
  await sendLog(channel.guild, 'server', { title: '🗑️ Channel Deleted', description: `${channel.name} (\`${channel.id}\`)`, color: 0xff4757 });
  await trackAntiNuke(channel.guild, AuditLogEvent.ChannelDelete, 'Channel Delete');
});

client.on('roleCreate', async (role) => {
  await sendLog(role.guild, 'server', { title: '🏷️ Role Created', description: `${role.name} (\`${role.id}\`)`, color: 0x2ed573 });
  await trackAntiNuke(role.guild, AuditLogEvent.RoleCreate, 'Role Create');
});

client.on('roleDelete', async (role) => {
  await sendLog(role.guild, 'server', { title: '🗑️ Role Deleted', description: `${role.name} (\`${role.id}\`)`, color: 0xff4757 });
  await trackAntiNuke(role.guild, AuditLogEvent.RoleDelete, 'Role Delete');
});

client.on('guildBanAdd', async (ban) => {
  await trackAntiNuke(ban.guild, AuditLogEvent.MemberBanAdd, 'Member Ban');
});

(async () => {
  await db.initDb();
  await client.login(process.env.DISCORD_TOKEN);
})();
