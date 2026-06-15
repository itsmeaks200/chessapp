# Chess Platform
## Complete MVP Document + 7-Day AI-Assisted Build Plan

**Stack:** React · Node.js · Redis · JWT · WebSockets · Groq (Llama 3.3 70B)  
**Modes:** Human vs AI (adaptive ELO difficulty) · Human vs Human multiplayer · Matchmaking engine  
**Scope:** ~1,830 LOC · 22 files · Targeted: DE Shaw Systems Internship

---

# Part 1 — MVP Technical Documentation

---

## 1. Project Overview

A full-stack chess platform with three core capabilities: JWT-authenticated user accounts, a Human vs AI mode powered by Llama 3.3 70B via the Groq API with ELO-adaptive difficulty, and real-time Human vs Human multiplayer with an ELO-based matchmaking engine backed by Redis.

Every architectural decision maps to patterns used in low-latency financial systems — the framing that matters for DE Shaw systems interviews:

- Matchmaking engine (ELO sorted set + atomic Lua claim) ↔ order matching engine (price-level index + atomic fill)
- FEN state serialization (70-char complete game state) ↔ compact tick data encoding
- WebSocket move broadcast ↔ real-time market data feed
- Server-side move validation ↔ trade validation / pre-trade risk check
- Adaptive AI difficulty via ELO feedback loop ↔ dynamic parameter adjustment in automated systems
- Redis key TTL for presence detection ↔ heartbeat liveness in distributed infrastructure

---

## 2. Technology Stack

| Layer | Technology | Justification |
|---|---|---|
| Frontend | React (JSX, no TypeScript) | Component model, custom hooks for AI/WS/matchmaking logic |
| Chess logic | chess.js v1.x | Move validation, FEN parsing, legal move generation — runs on both client and server |
| AI engine | Groq API — llama-3.3-70b-versatile | GPT-4o-level quality, 500+ tokens/sec on LPU hardware, free tier sufficient, OpenAI-compatible SDK |
| Backend | Node.js + Express | WebSocket-native, Redis pub/sub fits naturally, low overhead for real-time game state |
| Real-time | ws (WebSocket library) | Bidirectional move sync, opponent presence, disconnect events |
| State store | Redis (ioredis) | Sorted sets for matchmaking, hashes for game state, pub/sub for move broadcast, TTL for presence |
| Auth | JWT (jsonwebtoken) + bcrypt | Stateless session validation — any server instance verifies without DB lookup |
| Styling | Plain CSS Modules | Custom SVG board, full rendering control, no UI library dependency |

> **Why Groq over Anthropic:** chess AI turns need fast time-to-first-token, not deep reasoning. Llama 3.3 70B on Groq typically responds in under 1 second. The free tier (30 RPM, 14,400 RPD) is more than enough for a chess app.

---

## 3. System Architecture

### 3.1 High-Level Diagram

```
┌──────────────────────────────────────────────┐
│            React Client (Browser)             │
│  Board │ MoveHistory │ Lobby │ Auth │ ELO     │
└──────────────────┬───────────────────────────┘
                   │ WebSocket + HTTP/REST
┌──────────────────▼───────────────────────────┐
│             Node.js Server                    │
│  AuthMiddleware  │  MatchmakingEngine         │
│  GameRoomManager │  AIOrchestrator            │
│  ChessValidator  │  EloUpdater                │
└────────┬─────────────────────┬───────────────┘
         │                     │
  ┌──────▼──────┐     ┌────────▼──────────┐
  │    Redis    │     │   Groq API         │
  │ sorted sets │     │ llama-3.3-70b      │
  │ hashes      │     │ -versatile         │
  │ pub/sub     │     └───────────────────┘
  │ TTL keys    │
  └─────────────┘
```

### 3.2 Request Flow — Human vs AI

- Player makes move on board → client sends POST /api/game/:id/move with JWT
- Server auth middleware verifies JWT → attaches req.user
- ChessValidator runs chess.js server-side on current FEN → rejects illegal moves
- Valid move stored: updateGameFen(gameId, newFen) + appendMove(gameId, algebraic)
- AIOrchestrator builds ELO-aware prompt → POST to Groq API (llama-3.3-70b-versatile)
- Response parsed for UCI move string (4-5 chars, stripped of any whitespace)
- AI move validated again by chess.js → applied → new FEN returned to client
- On game end: POST /api/game/:id/result → EloUpdater computes new ELO → stored in Redis

### 3.3 Request Flow — Human vs Human

- Both players connect via WebSocket → send `{ type: 'join', gameId, token }` as first message
- Server verifies JWT, confirms player is white_id or black_id in game:{gameId}
- Player A sends `{ type: 'move', from, to }` → ChessValidator checks legality
- Valid move: updateGameFen + appendMove in Redis → broadcast `{ type: 'move', from, to, fen }` to both players via pub/sub
- Player B receives move → applies to local chess.js instance → re-renders board
- On disconnect: 60-second grace window → reconnect restores room → else setGameStatus abandoned

---

## 4. Authentication

### 4.1 Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register | Hash password (bcrypt, saltRounds=10), store user in Redis, return signed JWT |
| POST | /api/auth/login | Verify password, return JWT with { userId, username } payload, expiresIn: 7d |
| DELETE | /api/auth/account | Protected. Cascading delete: remove from queue, abandon active game, delete user keys |

### 4.2 Cascading Account Delete

Account deletion must clean up all Redis keys in this order to avoid orphaned state:

1. removeFromQueue(userId) — ZREM waiting_pool
2. Check presence:{userId} — if gameId exists, setGameStatus(gameId, abandoned) + publish opponent_disconnected to channel:game:{gameId}
3. DELETE presence:{userId}
4. DELETE username:{username} — frees the username for reuse
5. DELETE user:{userId} — final step

> **Warning:** If any step fails, log it but continue — partial cleanup is better than a failed delete leaving the account intact. This is a consistency challenge worth discussing in interviews: key-value stores have no foreign key constraints.

---

## 5. Adaptive AI Difficulty

The AI difficulty self-adjusts based on the player's ELO rating stored in Redis. No manual difficulty setting needed — it emerges from the ELO feedback loop.

### 5.1 ELO-Aware Prompt

```javascript
function buildDifficultyPrompt(playerElo) {
  if (playerElo < 800) return
    'You are a beginner chess player (ELO ~600). Make natural beginner ' +
    'mistakes: overlook simple captures, leave pieces undefended, ' +
    'miss one-move threats. Do not play perfectly.';

  if (playerElo < 1200) return
    'You are an intermediate chess player (ELO ~1000). Play solid ' +
    'positional moves but miss complex tactical combinations. ' +
    'Occasionally allow trades that are slightly unfavorable.';

  if (playerElo < 1600) return
    'You are an advanced chess player (ELO ~1400). Play strong moves, ' +
    'find most tactics, but miss deep multi-move combinations.';

  return
    'You are a strong chess player (ELO 1600+). Play the best ' +
    'available move. Prioritize tactical combinations and endgame technique.';
}
```

### 5.2 Full Groq API Call

```javascript
const Groq = require('groq-sdk');
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function getAIMove(fen, moveHistory, playerElo) {
  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: buildDifficultyPrompt(playerElo) +
          ' Respond with ONLY the best move in UCI format (e.g. e2e4).' +
          ' No explanation. No punctuation. Just the 4-5 character move string.'
      },
      {
        role: 'user',
        content: `FEN: ${fen}\nMove history: ${moveHistory.slice(-5).join(', ')}`
      }
    ],
    max_tokens: 10,
    temperature: 0.1
  });
  return completion.choices[0].message.content.trim();
}
```

> `max_tokens: 10` is intentional — UCI moves are 4-5 characters. Capping tokens reduces cost, latency, and the chance of the model adding explanation text.

### 5.3 ELO Update Formula

```javascript
function computeNewElo(playerElo, aiElo = 1500, score, K = 32) {
  // score: 1 = player wins, 0.5 = draw, 0 = player loses
  const expected = 1 / (1 + Math.pow(10, (aiElo - playerElo) / 400));
  return Math.round(playerElo + K * (score - expected));
}
```

K=32 for new players (ELO < 1200), K=16 for established players. Called in POST /api/game/:id/result and stored via updateUserElo(userId, newElo) in Redis.

---

## 6. Matchmaking Engine

### 6.1 Data Structure

```
ZADD waiting_pool <elo>       <player_id>              // enter queue
ZRANGEBYSCORE waiting_pool    (elo-100) (elo+100)       // O(log n + k) scan
ZREM waiting_pool             <player_id>               // exit queue
```

### 6.2 Atomic Match Claim — Lua Script

```lua
local pool    = KEYS[1]
local minElo  = ARGV[1]
local maxElo  = ARGV[2]
local selfId  = ARGV[3]

local results = redis.call('ZRANGEBYSCORE', pool, minElo, maxElo, 'LIMIT', 0, 5)
for _, candidate in ipairs(results) do
  if candidate ~= selfId then
    redis.call('ZREM', pool, candidate)
    redis.call('ZREM', pool, selfId)
    return candidate
  end
end
return nil
```

Scanning up to 5 candidates (not just 1) handles the case where the closest ELO player is yourself — a subtle edge case in the naive implementation.

### 6.3 Matchmaking State Machine

| State | Description | Redis Operation |
|---|---|---|
| searching | Player enters queue | ZADD waiting_pool + SET presence:{id} EX 30 |
| matched | Opponent found atomically via Lua | ZREM both players from pool |
| in_game | Game room created, both notified | HSET game:{id} + PUBLISH channel:game:{id} |
| cancelled | Player voluntarily leaves queue | ZREM waiting_pool + DEL presence:{id} |
| timeout | No match found, presence key expires | TTL expiry auto-removes stale presence |

---

## 7. Redis Key Schema

| Key Pattern | Type | Fields / Value | TTL |
|---|---|---|---|
| user:{id} | Hash | username, hashed_password, elo, created_at | None |
| username:{name} | String | user_id — uniqueness lookup on register | None |
| waiting_pool | Sorted Set | score=ELO, member=player_id | None |
| game:{id} | Hash | fen, white_id, black_id, status, turn, created_at | 24 hrs |
| moves:{id} | List | Algebraic notation per move, RPUSH order | 24 hrs |
| presence:{id} | String | game_id or 'lobby'. Heartbeat refreshes TTL. | 30 sec |
| channel:game:{id} | Pub/Sub | Move broadcast events to both subscribers | Ephemeral |

---

## 8. File Structure & LOC Estimate

### 8.1 Frontend (~920 LOC)

| File | Purpose | LOC |
|---|---|---|
| src/App.jsx | Root, routing (auth → lobby → game), token state | ~130 |
| src/pages/Auth.jsx | Login/register toggle, useAuth hook, error display | ~90 |
| src/pages/Game.jsx | Unified game view: AI mode + multiplayer mode, result handling | ~140 |
| src/components/Board.jsx | Custom SVG board, square clicks, legal move highlights, flip | ~190 |
| src/components/Piece.jsx | Unicode chess symbol renderer as SVG text | ~60 |
| src/components/MoveHistory.jsx | Algebraic notation list with auto-scroll | ~50 |
| src/components/GameStatus.jsx | Check / checkmate / draw / turn / ELO change display | ~50 |
| src/components/Lobby.jsx | Mode select, ELO badge, matchmaking queue UI, account controls | ~100 |
| src/hooks/useAuth.js | login, register, logout, deleteAccount, token state | ~80 |
| src/hooks/useChessAI.js | Groq fetch, AbortController, isThinking, cancelAIMove | ~80 |
| src/hooks/useWebSocket.js | WS connection, join handshake, sendMove, reconnect, onMove cb | ~90 |
| src/hooks/useMatchmaking.js | joinQueue, leaveQueue, polling, matched state | ~70 |
| src/constants.js | Board geometry, piece map, ELO bracket thresholds | ~40 |
| **Frontend total** | | **~920** |

### 8.2 Backend (~910 LOC)

| File | Purpose | LOC |
|---|---|---|
| server/index.js | Express setup, WS server, Redis connect, route mount | ~90 |
| server/redis.js | All Redis helpers: user CRUD, game CRUD, queue ops, pub/sub | ~180 |
| server/middleware/auth.js | JWT verify, attach req.user, 401 on failure | ~40 |
| server/routes/auth.js | POST /register, POST /login, DELETE /account (cascade) | ~110 |
| server/routes/game.js | POST /move, POST /ai-move, POST /result, GET /state, matchmaking routes | ~160 |
| server/aiOrchestrator.js | Groq SDK call, buildDifficultyPrompt, UCI parse + validation | ~90 |
| server/matchmaking.js | Lua script, findMatch, addToQueue, removeFromQueue, createGame | ~130 |
| server/chessValidator.js | Server-side chess.js wrapper, move legality gate, FEN guard | ~60 |
| server/eloUpdater.js | computeNewElo, updateUserElo, K-factor logic | ~50 |
| **Backend total** | | **~910** |

**Total: ~1,830 LOC across 22 files.**

---

## 9. API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | No | { username, password } → { token, username, elo } |
| POST | /api/auth/login | No | { username, password } → { token, username, elo } |
| DELETE | /api/auth/account | Yes | Cascading delete. Returns 204. |
| POST | /api/game/new | Yes | { mode: ai\|multiplayer } → { gameId, fen, color } |
| POST | /api/game/:id/move | Yes | { from, to } → { fen, algebraic, status } or { error } |
| POST | /api/game/:id/ai-move | Yes | Internal. { fen, history, playerElo } → { move } |
| POST | /api/game/:id/result | Yes | { score } → { newElo, eloDelta }. Updates Redis. |
| GET | /api/game/:id/state | Yes | Returns { fen, moves, status, turn, white, black } |
| POST | /api/matchmaking/join | Yes | Enter queue. Returns { matched, gameId?, color? } |
| GET | /api/matchmaking/status | Yes | Poll for match. Returns { matched, gameId? } |
| DELETE | /api/matchmaking/leave | Yes | Exit queue. Returns 204. |
| WS | ws://host/game/:id | Via msg | First msg: { type: join, gameId, token }. Then: { type: move, from, to } |

---

## 10. Key Design Decisions

**Why Llama 3.3 70B over DeepSeek-R1 for chess AI?**  
DeepSeek-R1 produces a `<think>` block before every response that must be stripped, adding parsing complexity and latency. For chess you need fast and clean UCI output, not deep reasoning. Llama 3.3 70B at 500+ tokens/sec on Groq produces the UCI move string directly. `max_tokens: 10` caps the response and makes parsing trivial.

**Why adaptive difficulty via prompt over Stockfish?**  
Stockfish at a given depth is deterministic and does not make human-like mistakes — beginners find it discouraging even at low levels. An LLM instructed to play at ELO 600 produces moves that feel like a real beginner. The ELO feedback loop means difficulty tracks the player's actual skill over time automatically.

**Why Redis sorted set for matchmaking over a SQL table?**  
ZRANGEBYSCORE is O(log n + k) — same complexity as a B-tree index scan but with no query planner overhead and atomic Lua script support. For a matchmaking system that may run hundreds of concurrent searches, Redis is the right primitive.

**Why stateless JWT over server-side sessions?**  
Any Node.js instance can verify a JWT without a Redis lookup — just the secret key. This matters for horizontal scaling: you can add server instances without a sticky session requirement.

**Why server-side chess.js validation in multiplayer?**  
The client cannot be trusted. A modified client could send illegal moves. Running chess.js on the server before any persistence or broadcast ensures the stored game state is always legal — the same principle as pre-trade risk checks.

---

## 11. Interview Talking Points for DE Shaw

- FEN as a 70-character complete state snapshot — self-contained, no history needed for reconstruction
- Redis Lua script eliminates match-claim race conditions without distributed locks — atomic at the Redis server level
- Matchmaking sorted set is structurally equivalent to an order book price-level index — same data structure, same complexity
- AbortController on AI fetch — async cancel prevents stale moves applying to a new game state
- ELO feedback loop makes difficulty self-adjusting — no manual tuning, emergent from player performance
- Cascading account delete as a consistency problem in a key-value store — no FK constraints, must be handled explicitly
- Server-side move validation as an untrusted-client model — validate before commit, same as pre-trade risk
- Presence via Redis TTL — lightweight liveness without a heartbeat service, expiry handles network partition
- `max_tokens: 10` on Groq AI call — constrained output reduces latency, cost, and parse complexity simultaneously
- K-factor in ELO (32 for new, 16 for established) — models uncertainty; new players have noisier ratings

---

## 12. Suggested Resume Bullet

> Built a full-stack chess platform (~1,830 LOC) with JWT auth, ELO-adaptive Human vs AI mode (Llama 3.3 70B via Groq API, adaptive difficulty via ELO-aware prompting, AbortController cancel semantics), and real-time Human vs Human multiplayer via WebSockets. Designed an ELO-based matchmaking engine using Redis sorted sets with atomic Lua scripts for race-free match claiming — structurally equivalent to an order matching engine. Implemented server-side move validation, FEN state serialization, ELO feedback loop for self-adjusting AI difficulty, and cascading account deletion with orphan-free Redis key cleanup across 7 key patterns.

---
---

# Part 2 — 7-Day AI-Assisted Build Plan

---

## How to Use These Prompts

Each prompt is designed to be pasted directly into Claude Code, Cursor, or any AI coding assistant.

- Paste the current file contents before asking for changes — AI has no memory between sessions
- One file per prompt — never ask for multiple files in one shot
- Run the code after every prompt before continuing
- Keep a NOTES.md — paste any deviations from this plan so AI stays in context on future prompts
- If AI hallucinates a method (wrong chess.js version, wrong ioredis signature), stop and correct before continuing

> **Warning:** chess.js API changed between v0.x and v1.x. In v1.x `move()` takes `{ from, to }` objects. Always tell the AI which version you have installed.

## Week at a Glance

| Day | Focus | Deliverable | Hours |
|---|---|---|---|
| 1 | Project setup + Auth backend | Register / login / delete endpoints + JWT + Redis user schema | 4-5 |
| 2 | Auth frontend | Login/register UI, useAuth hook, protected routing, token flow | 3-4 |
| 3 | Chess core + Human vs AI | SVG board, chess.js, legal moves, Groq AI with adaptive difficulty | 5-6 |
| 4 | ELO system | ELO update on game end, difficulty self-adjusts, ELO displayed in UI | 2-3 |
| 5 | Multiplayer backend | WebSocket server, game rooms, server-side validation, Redis game state | 5-6 |
| 6 | Matchmaking engine | Redis sorted set queue, Lua atomic match, polling, game room creation | 4-5 |
| 7 | Multiplayer frontend + polish | Lobby, WS hook, live sync, disconnect handling, E2E checklist | 4-5 |

---

## Day 1 — Project Setup + Auth Backend (4-5 hrs)
**Goal:** register / login / delete endpoints working with JWT + Redis. No frontend yet.

### Prompt 1.1 — Project scaffold

> Create a Node.js + Express project. Install these packages: express, ws, jsonwebtoken, bcrypt, ioredis, uuid, chess.js, groq-sdk, dotenv. Create this file structure: server/index.js, server/redis.js, server/middleware/auth.js, server/routes/auth.js, server/routes/game.js, server/aiOrchestrator.js, server/matchmaking.js, server/chessValidator.js, server/eloUpdater.js. In server/index.js: set up Express with express.json(), load dotenv, import and mount routes at /api/auth and /api/game, initialize HTTP server. Create a .env.example with: JWT_SECRET=, GROQ_API_KEY=, REDIS_URL=redis://localhost:6379. Do not implement route logic yet — skeleton only with correct imports. Plain JavaScript, no TypeScript.

### Prompt 1.2 — Redis user helpers

> In server/redis.js, create an ioredis client using process.env.REDIS_URL. Implement and export these functions: createUser(id, username, hashedPassword, elo=800) — HSET user:{id} with fields username, hashed_password, elo, created_at (ISO string). Also SET username:{username} = id. getUserById(id) — HGETALL user:{id}, return null if empty. getUserByUsername(username) — GET username:{username} to get id, then HGETALL user:{id}. updateUserElo(id, newElo) — HSET user:{id} elo {newElo}. deleteUser(id, username) — DEL user:{id} and DEL username:{username}. Also export the redis client itself as default. Plain JavaScript, no TypeScript.

### Prompt 1.3 — Auth middleware

> In server/middleware/auth.js implement a single Express middleware function. Read the Authorization header, expect format 'Bearer <token>'. Verify with jsonwebtoken using process.env.JWT_SECRET. On success: attach decoded payload as req.user and call next(). On missing header or invalid token: return res.status(401).json({ error: 'Unauthorized' }). Export as module.exports = authMiddleware. Plain JavaScript, no TypeScript.

### Prompt 1.4 — Auth routes

> In server/routes/auth.js implement three Express routes using helpers from server/redis.js and server/middleware/auth.js: POST /register — validate username and password are present, check getUserByUsername returns null (else 409 'Username taken'), generate uuid v4 as userId, bcrypt.hash(password, 10), call createUser with starting elo 800, sign JWT with payload { userId, username } secret process.env.JWT_SECRET expiresIn '7d', return 201 { token, username, elo: 800 }. POST /login — getUserByUsername, 401 if not found, bcrypt.compare password, 401 if wrong, sign JWT same shape, return 200 { token, username, elo }. DELETE /account — protected by authMiddleware. Get userId and username from req.user. Cascading delete in this order: (1) ZREM waiting_pool userId, (2) GET presence:{userId} — if it is a gameId call HSET game:{gameId} status abandoned and PUBLISH channel:game:{gameId} JSON.stringify({ type: 'opponent_disconnected' }), (3) DEL presence:{userId}, (4) call deleteUser(userId, username). Return 204. Wrap all async ops in try/catch, return 500 on unexpected errors. Plain JavaScript, no TypeScript.

> **Tip:** Test all three routes with curl. For delete: register, login to get token, then DELETE /account with Authorization header. Check redis-cli: `KEYS user:*` and `KEYS username:*` should both be empty after deletion.

---

## Day 2 — Auth Frontend (3-4 hrs)
**Goal:** Login and register UI complete. JWT in localStorage. Protected routing working.

### Prompt 2.1 — React scaffold

> Create a React frontend using Vite (npm create vite@latest client -- --template react). In client/vite.config.js add a proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } }. Install chess.js in the client directory. Create these empty files: src/App.jsx, src/hooks/useAuth.js, src/pages/Auth.jsx, src/pages/Game.jsx, src/components/Lobby.jsx. In src/App.jsx: read token from localStorage on mount (useState(() => localStorage.getItem('token'))). If token exists render a placeholder div saying 'Game view' and a logout button that clears localStorage and sets token to null. If no token render Auth.jsx with onSuccess callback that receives { token, username, elo } and sets token state. Plain JavaScript, no TypeScript.

### Prompt 2.2 — useAuth hook

> In src/hooks/useAuth.js implement a custom React hook called useAuth. State: loading (bool, false), error (string, null). All fetch calls send Content-Type: application/json. Protected calls send Authorization: Bearer {token from localStorage}. login(username, password) — POST /api/auth/login, on success store token in localStorage, return { token, username, elo }. On error set error state. register(username, password) — POST /api/auth/register, same. logout() — remove token from localStorage. deleteAccount() — DELETE /api/auth/account with auth header, on 204 call logout(). Return { login, register, logout, deleteAccount, loading, error }. Plain JavaScript, no TypeScript.

### Prompt 2.3 — Auth page

> In src/pages/Auth.jsx build a single component that toggles between login and register forms. Props: onSuccess({ token, username, elo }) callback. Use the useAuth hook. State: mode ('login' | 'register'), username (string), password (string). On submit call login or register accordingly. On success call onSuccess with the returned data. Show loading state on the button during the request. Show error message if error is set. Include a toggle link: 'Don't have an account? Register' / 'Already have an account? Login'. Minimal inline styles, no UI library. Plain JavaScript, no TypeScript.

> **Tip:** Register a new user, check localStorage has the token, refresh and confirm you stay logged in, click logout, log back in, then delete account and confirm you return to the login screen.

---

## Day 3 — Chess Core + Human vs AI + Adaptive Difficulty (5-6 hrs)
**Goal:** Fully playable game against Groq AI. Difficulty adapts to player ELO.

### Prompt 3.1 — SVG Board component

> In src/components/Board.jsx build a chess board as a single SVG element (560x560px, 70px per square). Props: fen (string), onMove(from, to) callback, orientation ('white' | 'black', default 'white'). Parse the FEN piece placement section (before the first space) to determine piece positions. Render 64 squares as SVG rect elements. Light squares color #F0D9B5, dark squares #B58863. Render rank numbers (1-8) and file letters (a-h) as small SVG text labels on the board edge. Render pieces as Unicode: ♔♕♖♗♘♙ for white, ♚♛♜♝♞♟ for black. Center each symbol in its square using SVG text with dominant-baseline='central' and text-anchor='middle'. White pieces font color #FFFFFF with a dark text-shadow trick using a slightly offset duplicate in #333333. Black pieces #1a1a1a. Click logic: first click on own piece sets selectedSquare state and highlights legal moves as semi-transparent green circles. Second click on a highlighted square calls onMove(from, to) and clears selection. Click on empty or opponent square clears selection. Respect orientation prop: when 'black', flip both rank and file rendering so black pieces are at the bottom. Use chess.js Chess class to compute legal moves for the selected piece. Plain JavaScript, no TypeScript.

### Prompt 3.2 — AI move backend route

> In server/aiOrchestrator.js implement getAIMove(fen, moveHistory, playerElo). Use groq-sdk: const Groq = require('groq-sdk'); const client = new Groq({ apiKey: process.env.GROQ_API_KEY }). Build difficulty system prompt based on playerElo brackets: below 800: beginner — make natural beginner mistakes, overlook simple captures, leave pieces undefended; 800-1200: intermediate — solid positional play but miss complex tactics; 1200-1600: advanced — strong moves, find most tactics, miss deep combinations; 1600+: expert — play the best available move, prioritize tactics and endgame. Append to system prompt: 'Respond with ONLY the best move in UCI format (e.g. e2e4). No explanation. No punctuation. Just the 4-5 character move string.' Call client.chat.completions.create with model 'llama-3.3-70b-versatile', max_tokens: 10, temperature: 0.1. Parse response: trim whitespace, validate with regex /^[a-h][1-8][a-h][1-8][qrbn]?$/. If validation fails, retry once. If second attempt fails, throw an error. Export getAIMove. Plain JavaScript, no TypeScript.

### Prompt 3.3 — Game route (AI move endpoint)

> In server/routes/game.js add POST /ai-move protected by authMiddleware. Body: { fen, history, playerElo }. Validate fen is a string and playerElo is a number. Call getAIMove(fen, history, playerElo) from server/aiOrchestrator.js. Return 200 { move } on success. Return 422 { error: 'AI could not produce a valid move' } on failure. Wrap in try/catch, return 500 on unexpected errors. Plain JavaScript, no TypeScript.

### Prompt 3.4 — useChessAI hook

> In src/hooks/useChessAI.js implement a hook that manages AI move requests. State: isThinking (bool, false), error (string, null). Store an AbortController in a useRef. getAIMove(fen, history, playerElo) — create a new AbortController (cancelling any existing one), POST /api/game/ai-move with { fen, history, playerElo } and auth header and signal, set isThinking true, on response set isThinking false and return the move string. On abort error do nothing. On other error set error state. cancelAIMove() — call controller.abort(). Cleanup: call cancelAIMove on unmount. Return { getAIMove, cancelAIMove, isThinking, error }. Plain JavaScript, no TypeScript.

### Prompt 3.5 — Game page (AI mode)

> In src/pages/Game.jsx implement the Human vs AI game view. Props: username (string), elo (number), onEloUpdate(newElo) callback, onReturnToLobby() callback. Use chess.js Chess class for local game state. Use Board component. Use useChessAI hook. On player move: call chess.move({ from, to, promotion: 'q' }), if null the move is illegal — ignore. If valid update fen state. Check chess.isGameOver(). If not over and it is AI turn (chess.turn() === 'b'), call getAIMove with current FEN, last 5 moves in algebraic, and current elo prop. On AI move returned: call chess.move({ from: move.slice(0,2), to: move.slice(2,4) }), update fen state, check game over. On game over: determine score (1 = player wins, 0 = player loses, 0.5 = draw), POST /api/game/result with { score, playerElo: elo }, call onEloUpdate with returned newElo, show result modal with ELO change. Show: current turn indicator, check/checkmate/draw status, move history list, isThinking spinner, Reset button (calls cancelAIMove + new Chess()), Return to Lobby button. Plain JavaScript, no TypeScript.

> **Tip:** Play a full game to checkmate. Reset mid-game while AI is thinking — confirm no move is applied after reset. Manually set your ELO to 400 in Redis (`HSET user:{id} elo 400`) and verify the AI plays weaker moves.

---

## Day 4 — ELO System (2-3 hrs)
**Goal:** ELO updates on game end. Difficulty visibly self-adjusts after wins and losses.

### Prompt 4.1 — ELO updater

> In server/eloUpdater.js implement and export: computeNewElo(playerElo, aiElo = 1500, score) — standard ELO formula. K factor: 32 if playerElo < 1200, else 16. expected = 1 / (1 + Math.pow(10, (aiElo - playerElo) / 400)). newElo = Math.round(playerElo + K * (score - expected)). Return newElo. Score: 1 = win, 0.5 = draw, 0 = loss. Plain JavaScript, no TypeScript.

### Prompt 4.2 — Game result route

> In server/routes/game.js add POST /result protected by authMiddleware. Body: { score } (0, 0.5, or 1). Get the player's current ELO: const user = await getUserById(req.user.userId). Call computeNewElo(Number(user.elo), 1500, score) from server/eloUpdater.js. Call updateUserElo(req.user.userId, newElo) from server/redis.js. Return 200 { newElo, eloDelta: newElo - Number(user.elo) }. Plain JavaScript, no TypeScript.

### Prompt 4.3 — ELO display in UI

> In src/App.jsx add elo to the top-level state (initialized from the login/register response). Pass elo and an onEloUpdate(newElo) callback into Game.jsx. In src/components/Lobby.jsx show the player's current ELO as a badge next to their username. After a game ends and onEloUpdate is called, the lobby ELO badge should reflect the new value immediately without a page refresh. In Game.jsx result modal show the ELO change as: 'ELO: 920 → 952 (+32)' in green for gains, red for losses. Plain JavaScript, no TypeScript.

> **Tip:** Win a game and confirm ELO increases in both the result modal and the lobby badge. Check `redis-cli HGET user:{id} elo` matches what the UI shows.

---

## Day 5 — Multiplayer Backend (5-6 hrs)
**Goal:** WebSocket server running. Game rooms created. Server-side validation. Redis game state.

### Prompt 5.1 — Redis game + move helpers

> In server/redis.js add these functions: createGame(gameId, whiteId, blackId) — HSET game:{gameId} fields: fen (starting FEN from new Chess().fen()), white_id, black_id, status='active', turn='w', created_at. EXPIRE game:{gameId} 86400. getGame(gameId) — HGETALL game:{gameId}, return null if empty. updateGameFen(gameId, fen, turn) — HSET game:{gameId} fen {fen} turn {turn}. appendMove(gameId, algebraic) — RPUSH moves:{gameId} {algebraic}. getMoves(gameId) — LRANGE moves:{gameId} 0 -1. setGameStatus(gameId, status) — HSET game:{gameId} status {status}. setPresence(playerId, value) — SET presence:{playerId} {value} EX 30. getPresence(playerId) — GET presence:{playerId}. delPresence(playerId) — DEL presence:{playerId}. Export all. Plain JavaScript, no TypeScript.

### Prompt 5.2 — ChessValidator

> In server/chessValidator.js implement and export: validateMove(fen, from, to) — create new Chess(fen), call chess.move({ from, to, promotion: 'q' }), if result is null return { valid: false }. If valid return { valid: true, newFen: chess.fen(), algebraic: result.san, isGameOver: chess.isGameOver(), turn: chess.turn() }. isValidFen(fen) — try new Chess(fen), return true if it does not throw, false otherwise. Plain JavaScript, no TypeScript.

### Prompt 5.3 — WebSocket server

> In server/index.js add a WebSocket server using the ws package: const wss = new WebSocket.Server({ server }). Maintain a Map called rooms: Map<gameId, Map<playerId, ws>>. On wss connection: (1) Wait for first message — parse as JSON, expect { type: 'join', gameId, token }. Verify JWT with process.env.JWT_SECRET. Fetch game with getGame(gameId). Confirm decoded.userId is white_id or black_id. Add ws to rooms.get(gameId) or create new Map. Send { type: 'joined', color: userId===white_id ? 'white' : 'black' }. (2) On subsequent messages — parse as JSON, expect { type: 'move', from, to }. Get current game FEN from Redis. Call validateMove(fen, from, to). If invalid send { type: 'error', message: 'Illegal move' } and return. If valid: call updateGameFen, appendMove. Broadcast { type: 'move', from, to, fen: newFen, algebraic, isGameOver } to all clients in the room. If isGameOver call setGameStatus(gameId, 'finished'). (3) On ws close: remove from rooms. Set a 60-second timeout. If player does not reconnect: setGameStatus(gameId, 'abandoned'), broadcast { type: 'opponent_disconnected' } to remaining player. Wrap all ws message handling in try/catch — never let an uncaught error crash the server. Plain JavaScript, no TypeScript.

> **Warning:** Verify an illegal move is rejected without crashing the server. Send a raw illegal move via wscat and confirm the server stays up.

---

## Day 6 — Matchmaking Engine (4-5 hrs)
**Goal:** ELO queue working. Atomic Lua match claim. Game room auto-created on match.

### Prompt 6.1 — Matchmaking Redis helpers

> In server/redis.js add: addToQueue(playerId, elo) — ZADD waiting_pool {elo} {playerId}. removeFromQueue(playerId) — ZREM waiting_pool {playerId}. findMatch(playerId, elo, range=100) — define a Lua script as a string: 'local results = redis.call("ZRANGEBYSCORE", KEYS[1], ARGV[1], ARGV[2], "LIMIT", 0, 5) for _, candidate in ipairs(results) do if candidate ~= ARGV[3] then redis.call("ZREM", KEYS[1], candidate) redis.call("ZREM", KEYS[1], ARGV[3]) return candidate end end return nil'. Call with redis.eval(script, 1, 'waiting_pool', elo-range, elo+range, playerId). Return the opponent playerId or null. Plain JavaScript, no TypeScript.

### Prompt 6.2 — Matchmaking routes

> In server/routes/game.js add matchmaking routes, all protected by authMiddleware: POST /matchmaking/join — get user from getUserById(req.user.userId). Call addToQueue(userId, user.elo). Call findMatch(userId, user.elo). If match found: generate uuid gameId, assign colors randomly (Math.random() > 0.5), call createGame(gameId, whiteId, blackId), call setPresence for both players with the gameId, return 200 { matched: true, gameId, color: userId===whiteId ? 'white' : 'black' }. If no match: call setPresence(userId, 'searching') with EX 60, return 200 { matched: false }. GET /matchmaking/status — call getPresence(userId). If value is a gameId (not 'searching' or null) return { matched: true, gameId }. Else return { matched: false }. DELETE /matchmaking/leave — call removeFromQueue(userId), delPresence(userId), return 204. Plain JavaScript, no TypeScript.

> **Tip:** Register two users, curl POST /matchmaking/join from both simultaneously. Both should return `matched: true` with the same gameId and opposite colors. Verify `ZCARD waiting_pool` returns 0 in redis-cli.

---

## Day 7 — Multiplayer Frontend + Polish (4-5 hrs)
**Goal:** Full end-to-end flow working. All edge cases handled.

### Prompt 7.1 — useWebSocket hook

> In src/hooks/useWebSocket.js implement a hook that manages a WebSocket connection. Parameter: gameId (string). On mount: connect to ws://localhost:3001. Immediately send { type: 'join', gameId, token: localStorage.getItem('token') } as first message. State: connected (bool, false). On message: parse JSON. If type === 'joined' set connected true and call onJoined(color) callback. If type === 'move' call onMove(data) callback. If type === 'opponent_disconnected' call onOpponentDisconnected() callback. If type === 'error' call onError(data.message) callback. sendMove(from, to) — send { type: 'move', from, to } if socket is open. Reconnect once automatically if socket closes unexpectedly (not on intentional unmount close). On unmount: close socket intentionally (do not reconnect). Accept callbacks as a ref object parameter: { onJoined, onMove, onOpponentDisconnected, onError }. Return { sendMove, connected }. Plain JavaScript, no TypeScript.

### Prompt 7.2 — useMatchmaking hook

> In src/hooks/useMatchmaking.js implement a hook for the matchmaking flow. State: searching (bool, false), gameId (string, null), color (string, null), error (string, null). joinQueue() — POST /api/matchmaking/join with auth header. If matched: true set gameId and color and return. If matched: false start polling GET /api/matchmaking/status every 2000ms. On each poll: if matched set gameId and color and stop polling. leaveQueue() — DELETE /api/matchmaking/leave with auth header. Stop polling. Set searching false. Stop polling and clear interval on unmount. Return { joinQueue, leaveQueue, searching, gameId, color, error }. Plain JavaScript, no TypeScript.

### Prompt 7.3 — Lobby component

> In src/components/Lobby.jsx build the main lobby screen. Props: username (string), elo (number), onStartAI() callback, onStartMultiplayer(gameId, color) callback, onLogout() callback, onDeleteAccount() callback. Use useMatchmaking hook. Show: username and ELO badge at the top. Two primary buttons: 'Play vs AI' (calls onStartAI) and 'Find Opponent'. When Find Opponent is clicked: call joinQueue(). Show 'Searching for opponent...' with a Cancel button that calls leaveQueue(). When gameId is set (match found): call onStartMultiplayer(gameId, color). Show a Logout button and a Delete Account button. Delete Account shows an inline confirmation ('Are you sure? This cannot be undone' with Confirm and Cancel) before calling onDeleteAccount. Show error if matchmaking error is set. Plain JavaScript, no TypeScript.

### Prompt 7.4 — Game page (multiplayer mode)

> Update src/pages/Game.jsx to support a multiplayer mode alongside the existing AI mode. New props when mode === 'multiplayer': gameId (string), color ('white' | 'black'). In multiplayer mode: use useWebSocket hook with gameId. Pass callbacks: onMove — apply the received move to chess.js and update fen state. onOpponentDisconnected — show a banner 'Opponent disconnected. You win!' and disable the board. onError — show error message. On the player making a move: validate locally with chess.js first (to give instant feedback). If locally valid call sendMove(from, to). Do NOT apply the move to chess.js local state yet — wait for the server broadcast to come back via onMove callback. This keeps the server as the single source of truth. Set board orientation based on color prop. Show opponent's color label above the board, player's color label below. Show 'Waiting for opponent...' overlay if connected is false. Plain JavaScript, no TypeScript.

### Prompt 7.5 — App.jsx final wiring

> Update src/App.jsx to wire all views together. State: token, username, elo, view ('auth' | 'lobby' | 'game'), gameMode (null | 'ai' | 'multiplayer'), gameId (null | string), color (null | 'white' | 'black'). Auth → Lobby: onSuccess({ token, username, elo }) stores in state and localStorage, sets view to lobby. Lobby → AI game: onStartAI() sets gameMode='ai', view='game'. Lobby → Multiplayer game: onStartMultiplayer(gameId, color) sets gameMode='multiplayer', gameId, color, view='game'. Game → Lobby: onReturnToLobby() resets gameMode/gameId/color, sets view='lobby'. onEloUpdate(newElo) updates elo state — propagates to lobby badge. Logout: clear all state and localStorage. Plain JavaScript, no TypeScript.

### Day 7 Final E2E Checklist

| Flow | Test steps | Pass? |
|---|---|---|
| Auth | Register → see lobby with ELO 800 badge → logout → login → badge still shows | |
| Account delete | Login → delete account → confirm prompt → return to login → try login with same credentials → 401 | |
| Human vs AI | Start AI game → make 5 moves → AI responds each time with appropriate skill level | |
| AI difficulty | Set elo to 400 in redis-cli → start AI game → AI plays weak. Set elo to 1800 → AI plays strong | |
| ELO update | Win a game → result modal shows ELO gain → lobby badge updates → HGET user:{id} elo in Redis matches | |
| AI abort | Start AI game → AI is thinking → click Reset → no move applied after reset | |
| Matchmaking | Two users open lobby → both click Find Opponent → matched within 5 seconds → game starts | |
| Multiplayer moves | Player A moves → appears on Player B board within 200ms | |
| Turn enforcement | Player A tries to move twice in a row → second move rejected by server | |
| Illegal move | Send { type: move, from: e2, to: e5 } on move 1 via WS → rejected, game state unchanged | |
| Opponent disconnect | Player B closes tab → Player A sees disconnect banner after 60 seconds | |
| Reconnect | Player B closes and reopens tab within 60 seconds → re-sends join message → game resumes | |
| Queue cleanup | Delete account while in matchmaking queue → ZCARD waiting_pool decrements | |

---

## General AI Coding Tips

- Always paste the current file before asking for changes. AI has no memory between sessions.
- chess.js v1.x: `move()` takes `{ from, to }`. v0.x takes algebraic strings. Tell the AI your version upfront.
- Test each Redis helper function in isolation with a small script before integrating.
- The Lua matchmaking script: ask the AI to write it, then separately ask it to explain each line. If it cannot explain a line, that line is probably wrong.
- Groq API is OpenAI-compatible — if AI tries to use the Anthropic SDK, correct it: use groq-sdk or openai SDK with `baseURL: 'https://api.groq.com/openai/v1'`.
- `max_tokens: 10` on AI move calls is intentional — do not let the AI increase this.
- If WebSocket messages stop working, add `console.log` to the server `ws.on('message')` handler first — it is almost always a JSON parse error on a malformed message.

---

## Final Resume Bullet

> Built a full-stack chess platform (~1,830 LOC) with JWT auth, ELO-adaptive Human vs AI mode (Llama 3.3 70B via Groq API, adaptive difficulty via ELO-aware prompting, AbortController cancel semantics), and real-time Human vs Human multiplayer via WebSockets. Designed an ELO-based matchmaking engine using Redis sorted sets with atomic Lua scripts for race-free match claiming — structurally equivalent to an order matching engine. Implemented server-side move validation, FEN state serialization, ELO feedback loop for self-adjusting AI difficulty, and cascading account deletion with orphan-free Redis key cleanup across 7 key patterns.

---

*End of Document*
