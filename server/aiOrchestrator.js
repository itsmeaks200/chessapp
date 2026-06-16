// AI Orchestrator — Groq API integration
// Handles ELO-aware prompt building and UCI move parsing

const Groq = require('groq-sdk');
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── ELO-Aware Difficulty Prompt ─────────────────────────────

function buildDifficultyPrompt(playerElo) {
  if (playerElo < 800) return (
    'You are a beginner chess player (ELO ~600). Make natural beginner ' +
    'mistakes: overlook simple captures, leave pieces undefended, ' +
    'miss one-move threats. Do not play perfectly.'
  );

  if (playerElo < 1200) return (
    'You are an intermediate chess player (ELO ~1000). Play solid ' +
    'positional moves but miss complex tactical combinations. ' +
    'Occasionally allow trades that are slightly unfavorable.'
  );

  if (playerElo < 1600) return (
    'You are an advanced chess player (ELO ~1400). Play strong moves, ' +
    'find most tactics, but miss deep multi-move combinations.'
  );

  return (
    'You are a strong chess player (ELO 1600+). Play the best ' +
    'available move. Prioritize tactical combinations and endgame technique.'
  );
}

// ─── UCI Move Validation ─────────────────────────────────────

const UCI_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function parseUCIMove(raw) {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-h1-8qrbn]/g, '');
  if (UCI_REGEX.test(cleaned)) return cleaned;
  // Try to extract from longer response
  const match = raw.match(/[a-h][1-8][a-h][1-8][qrbn]?/);
  return match ? match[0] : null;
}

// ─── Groq API Call ───────────────────────────────────────────

async function getAIMove(fen, moveHistory, playerElo) {
  const systemPrompt = buildDifficultyPrompt(playerElo) +
    ' Respond with ONLY the best move in UCI format (e.g. e2e4).' +
    ' No explanation. No punctuation. Just the 4-5 character move string.';

  const userContent = `FEN: ${fen}\nMove history: ${
    Array.isArray(moveHistory) ? moveHistory.slice(-5).join(', ') : ''
  }`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        max_tokens: 10,
        temperature: 0.1
      });

      const raw = completion.choices[0].message.content;
      const move = parseUCIMove(raw);

      if (move) {
        console.log(`AI move (attempt ${attempt + 1}): ${move} (raw: "${raw.trim()}")`);
        return move;
      }

      console.warn(`AI returned invalid UCI (attempt ${attempt + 1}): "${raw.trim()}"`);
    } catch (err) {
      console.error(`Groq API error (attempt ${attempt + 1}):`, err.message);
      if (attempt === 1) throw err;
    }
  }

  throw new Error('AI could not produce a valid move after 2 attempts');
}

module.exports = { getAIMove, buildDifficultyPrompt };
