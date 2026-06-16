const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getAIMove } = require('../aiOrchestrator');
const { computeNewElo } = require('../eloUpdater');
const { getUserById, updateUserElo } = require('../redis');

// ─── POST /ai-move ───────────────────────────────────────────
// Client sends current FEN + move history + player ELO
// Returns the AI's move in UCI format

router.post('/ai-move', authMiddleware, async (req, res) => {
  try {
    const { fen, history, playerElo } = req.body;

    if (!fen || typeof fen !== 'string') {
      return res.status(400).json({ error: 'Valid FEN string is required' });
    }

    if (typeof playerElo !== 'number') {
      return res.status(400).json({ error: 'playerElo must be a number' });
    }

    const move = await getAIMove(fen, history || [], playerElo);
    return res.status(200).json({ move });
  } catch (err) {
    console.error('AI move error:', err.message);
    return res.status(422).json({ error: 'AI could not produce a valid move' });
  }
});

// ─── POST /result ────────────────────────────────────────────
// Called when a game ends. Updates player ELO in Redis.
// score: 1 = player wins, 0.5 = draw, 0 = player loses

router.post('/result', authMiddleware, async (req, res) => {
  try {
    const { score } = req.body;

    if (score !== 0 && score !== 0.5 && score !== 1) {
      return res.status(400).json({ error: 'Score must be 0, 0.5, or 1' });
    }

    const user = await getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentElo = Number(user.elo);
    const newElo = computeNewElo(currentElo, 1500, score);
    await updateUserElo(req.user.userId, newElo);

    return res.status(200).json({
      newElo,
      eloDelta: newElo - currentElo
    });
  } catch (err) {
    console.error('Result error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Matchmaking routes (Day 6) ──────────────────────────────

// POST /matchmaking/join
// GET /matchmaking/status
// DELETE /matchmaking/leave

module.exports = router;
