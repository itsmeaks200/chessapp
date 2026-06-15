const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const {
  createUser,
  getUserById,
  getUserByUsername,
  deleteUser,
  removeFromQueue,
  getPresence,
  delPresence,
  setGameStatus,
  redis
} = require('../redis');

// POST /register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    // Check if username is taken
    const existing = await getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username taken' });
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    await createUser(userId, username, hashedPassword, 800);

    const token = jwt.sign(
      { userId, username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({ token, username, elo: 800 });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.hashed_password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      token,
      username: user.username,
      elo: Number(user.elo)
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /account — cascading delete
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { userId, username } = req.user;

    // 1. Remove from matchmaking queue
    try {
      await removeFromQueue(userId);
    } catch (err) {
      console.error('Queue cleanup error:', err.message);
    }

    // 2. Check presence — if in a game, abandon it
    try {
      const presence = await getPresence(userId);
      if (presence && presence !== 'searching' && presence !== 'lobby') {
        // presence value is a gameId
        await setGameStatus(presence, 'abandoned');
        await redis.publish(
          `channel:game:${presence}`,
          JSON.stringify({ type: 'opponent_disconnected' })
        );
      }
    } catch (err) {
      console.error('Presence cleanup error:', err.message);
    }

    // 3. Delete presence key
    try {
      await delPresence(userId);
    } catch (err) {
      console.error('Presence delete error:', err.message);
    }

    // 4. Delete user data
    await deleteUser(userId, username);

    return res.status(204).send();
  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
