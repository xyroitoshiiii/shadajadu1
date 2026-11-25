module.exports = {
  antiSpam: {
    maxMessages: 5,
    windowMs: 5000, // 5 messages in 5 seconds
    timeoutMs: 60 * 1000, // 1 minute timeout
  },
  antiRaid: {
    maxJoins: 6,
    windowMs: 10000, // 6 joins in 10 seconds triggers raid alert
  },
  autoMod: {
    blockInvites: true,
    blockedWords: ['scam', 'free-nitro'], // Add words to filter
  },
};
