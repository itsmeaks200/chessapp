const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// ─── Game routes (Day 3+) ────────────────────────────────────

// POST /ai-move — Day 3
// POST /result — Day 4
// GET /:id/state — Day 5
// POST /:id/move — Day 5

// ─── Matchmaking routes (Day 6) ──────────────────────────────

// POST /matchmaking/join
// GET /matchmaking/status
// DELETE /matchmaking/leave

module.exports = router;
