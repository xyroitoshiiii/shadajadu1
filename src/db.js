const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'security.db');
let db = null;

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      prefix TEXT DEFAULT '!',
      antinuke_punishment TEXT DEFAULT 'strip',
      antinuke_limit INTEGER DEFAULT 3,
      antispam_limit INTEGER DEFAULT 5,
      antispam_window_ms INTEGER DEFAULT 5000,
      alt_age_days INTEGER DEFAULT 7,
      block_invites INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS log_channels (
      guild_id TEXT PRIMARY KEY,
      security_channel TEXT,
      mod_channel TEXT,
      message_channel TEXT,
      member_channel TEXT,
      server_channel TEXT,
      vc_channel TEXT
    );

    CREATE TABLE IF NOT EXISTS whitelist (
      guild_id TEXT,
      target_id TEXT,
      type TEXT,
      PRIMARY KEY (guild_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS log_ignores (
      guild_id TEXT,
      target_id TEXT,
      type TEXT,
      PRIMARY KEY (guild_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      user_id TEXT,
      moderator_id TEXT,
      reason TEXT,
      created_at INTEGER
    );
  `);
  saveDb();
  return db;
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function getSettings(guildId) {
  let row = queryOne('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
  if (!row) {
    runSql('INSERT INTO guild_settings (guild_id) VALUES (?)', [guildId]);
    row = queryOne('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
  }
  return row;
}

function updateSetting(guildId, key, value) {
  getSettings(guildId);
  const allowed = [
    'prefix',
    'antinuke_punishment',
    'antinuke_limit',
    'antispam_limit',
    'antispam_window_ms',
    'alt_age_days',
    'block_invites',
  ];
  if (!allowed.includes(key)) throw new Error(`Invalid setting key: ${key}`);
  runSql(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`, [value, guildId]);
}

function getLogChannels(guildId) {
  return queryOne('SELECT * FROM log_channels WHERE guild_id = ?', [guildId]) || {};
}

function setLogChannels(guildId, channels) {
  runSql(
    `INSERT INTO log_channels (guild_id, security_channel, mod_channel, message_channel, member_channel, server_channel, vc_channel)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET
       security_channel = excluded.security_channel,
       mod_channel = excluded.mod_channel,
       message_channel = excluded.message_channel,
       member_channel = excluded.member_channel,
       server_channel = excluded.server_channel,
       vc_channel = excluded.vc_channel`,
    [
      guildId,
      channels.security_channel,
      channels.mod_channel,
      channels.message_channel,
      channels.member_channel,
      channels.server_channel,
      channels.vc_channel,
    ]
  );
}

function isWhitelisted(guildId, targetIds) {
  const rows = queryAll('SELECT target_id FROM whitelist WHERE guild_id = ?', [guildId]);
  const set = new Set(rows.map((r) => r.target_id));
  return targetIds.some((id) => set.has(id));
}

function toggleWhitelist(guildId, targetId, type) {
  const existing = queryOne('SELECT 1 FROM whitelist WHERE guild_id = ? AND target_id = ?', [guildId, targetId]);
  if (existing) {
    runSql('DELETE FROM whitelist WHERE guild_id = ? AND target_id = ?', [guildId, targetId]);
    return false;
  }
  runSql('INSERT INTO whitelist (guild_id, target_id, type) VALUES (?, ?, ?)', [guildId, targetId, type]);
  return true;
}

function isLogIgnored(guildId, targetIds) {
  const rows = queryAll('SELECT target_id FROM log_ignores WHERE guild_id = ?', [guildId]);
  const set = new Set(rows.map((r) => r.target_id));
  return targetIds.some((id) => set.has(id));
}

function toggleLogIgnore(guildId, targetId, type) {
  const existing = queryOne('SELECT 1 FROM log_ignores WHERE guild_id = ? AND target_id = ?', [guildId, targetId]);
  if (existing) {
    runSql('DELETE FROM log_ignores WHERE guild_id = ? AND target_id = ?', [guildId, targetId]);
    return false;
  }
  runSql('INSERT INTO log_ignores (guild_id, target_id, type) VALUES (?, ?, ?)', [guildId, targetId, type]);
  return true;
}

function addWarning(guildId, userId, moderatorId, reason) {
  runSql('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?)', [
    guildId,
    userId,
    moderatorId,
    reason,
    Date.now(),
  ]);
}

function getWarnings(guildId, userId) {
  return queryAll('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [
    guildId,
    userId,
  ]);
}

module.exports = {
  initDb,
  getSettings,
  updateSetting,
  getLogChannels,
  setLogChannels,
  isWhitelisted,
  toggleWhitelist,
  isLogIgnored,
  toggleLogIgnore,
  addWarning,
  getWarnings,
};
