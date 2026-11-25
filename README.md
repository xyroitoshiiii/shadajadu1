# Discord Security Bot (Node.js + SQLite)

Full-featured Discord Security, Anti-Nuke, Auto-Mod, and Logging Bot supporting **both Slash (`/`) and Prefix (`!`) commands** with SQLite persistence.

## Features
- **SQLite Database (`security.db`)**: Stores custom prefixes, anti-nuke settings, anti-spam limits, alt-account thresholds, log channels, whitelists, log-ignore lists, and warnings.
- **Anti-Nuke**: Detects mass channel create/delete, role create/delete, and mass bans via Audit Logs; punishes non-whitelisted executors (`strip`, `ban`, or `kick`).
- **Auto-Setup Logging (`/setuplogs` or `!setuplogs`)**: Automatically creates `🔒 Security Logs` category with `#security-alerts`, `#mod-logs`, `#message-logs`, `#member-logs`, `#server-logs`, and `#vc-logs`.
- **Full Logging**: Message delete/edit (with content & attachments), member join/leave, VC join/leave/move, channel/role create/delete, and moderation actions.
- **Customizable via Commands**: `setprefix`, `antinuke`, `antispam`, `altage`, `whitelist`, `ignorelog`, `config`.

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and add your bot token:
   ```bash
   cp .env.example .env
   ```
3. Enable **Message Content Intent** and **Server Members Intent** in the Discord Developer Portal.
4. Start the bot:
   ```bash
   npm start
   ```
