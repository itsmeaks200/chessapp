const Redis = require('ioredis');
const { Chess } = require('chess.js');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

// ─── User CRUD ───────────────────────────────────────────────

async function createUser(id, username, hashedPassword, elo = 800) {
  await redis.hset(`user:${id}`, {
    username,
    hashed_password: hashedPassword,
    elo: String(elo),
    created_at: new Date().toISOString()
  });
  await redis.set(`username:${username}`, id);
}

async function getUserById(id) {
  const user = await redis.hgetall(`user:${id}`);
  if (!user || Object.keys(user).length === 0) return null;
  return user;
}

async function getUserByUsername(username) {
  const id = await redis.get(`username:${username}`);
  if (!id) return null;
  const user = await redis.hgetall(`user:${id}`);
  if (!user || Object.keys(user).length === 0) return null;
  user.id = id;
  return user;
}

async function updateUserElo(id, newElo) {
  await redis.hset(`user:${id}`, 'elo', String(newElo));
}

async function deleteUser(id, username) {
  await redis.del(`user:${id}`);
  await redis.del(`username:${username}`);
}

// ─── Game CRUD (skeleton — filled in Day 5) ─────────────────

async function createGame(gameId, whiteId, blackId) {
  const startingFen = new Chess().fen();
  await redis.hset(`game:${gameId}`, {
    fen: startingFen,
    white_id: whiteId,
    black_id: blackId,
    status: 'active',
    turn: 'w',
    created_at: new Date().toISOString()
  });
  await redis.expire(`game:${gameId}`, 86400);
}

async function getGame(gameId) {
  const game = await redis.hgetall(`game:${gameId}`);
  if (!game || Object.keys(game).length === 0) return null;
  return game;
}

async function updateGameFen(gameId, fen, turn) {
  await redis.hset(`game:${gameId}`, { fen, turn });
}

async function appendMove(gameId, algebraic) {
  await redis.rpush(`moves:${gameId}`, algebraic);
}

async function getMoves(gameId) {
  return await redis.lrange(`moves:${gameId}`, 0, -1);
}

async function setGameStatus(gameId, status) {
  await redis.hset(`game:${gameId}`, 'status', status);
}

// ─── Presence ────────────────────────────────────────────────

async function setPresence(playerId, value) {
  await redis.set(`presence:${playerId}`, value, 'EX', 30);
}

async function getPresence(playerId) {
  return await redis.get(`presence:${playerId}`);
}

async function delPresence(playerId) {
  await redis.del(`presence:${playerId}`);
}

// ─── Matchmaking (skeleton — filled in Day 6) ───────────────

async function addToQueue(playerId, elo) {
  await redis.zadd('waiting_pool', elo, playerId);
}

async function removeFromQueue(playerId) {
  await redis.zrem('waiting_pool', playerId);
}

async function findMatch(playerId, elo, range = 100) {
  const luaScript = `
    local results = redis.call("ZRANGEBYSCORE", KEYS[1], ARGV[1], ARGV[2], "LIMIT", 0, 5)
    for _, candidate in ipairs(results) do
      if candidate ~= ARGV[3] then
        redis.call("ZREM", KEYS[1], candidate)
        redis.call("ZREM", KEYS[1], ARGV[3])
        return candidate
      end
    end
    return nil
  `;
  const result = await redis.eval(luaScript, 1, 'waiting_pool', elo - range, elo + range, playerId);
  return result || null;
}

// ─── Exports ─────────────────────────────────────────────────

module.exports = {
  default: redis,
  redis,
  createUser,
  getUserById,
  getUserByUsername,
  updateUserElo,
  deleteUser,
  createGame,
  getGame,
  updateGameFen,
  appendMove,
  getMoves,
  setGameStatus,
  setPresence,
  getPresence,
  delPresence,
  addToQueue,
  removeFromQueue,
  findMatch
};
