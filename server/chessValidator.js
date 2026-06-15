// Chess Validator — server-side move legality gate (Day 5)
const { Chess } = require('chess.js');

function validateMove(fen, from, to) {
  try {
    const chess = new Chess(fen);
    const result = chess.move({ from, to, promotion: 'q' });
    if (!result) return { valid: false };
    return {
      valid: true,
      newFen: chess.fen(),
      algebraic: result.san,
      isGameOver: chess.isGameOver(),
      turn: chess.turn()
    };
  } catch (err) {
    return { valid: false };
  }
}

function isValidFen(fen) {
  try {
    new Chess(fen);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { validateMove, isValidFen };
