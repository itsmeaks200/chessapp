import './GameStatus.css';

export default function GameStatus({ chess, isThinking, isPlayerTurn }) {
  let statusText = '';
  let statusType = 'normal';

  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    statusText = `Checkmate! ${winner} wins`;
    statusType = 'checkmate';
  } else if (chess.isDraw()) {
    if (chess.isStalemate()) {
      statusText = 'Stalemate — Draw';
    } else if (chess.isThreefoldRepetition()) {
      statusText = 'Threefold Repetition — Draw';
    } else if (chess.isInsufficientMaterial()) {
      statusText = 'Insufficient Material — Draw';
    } else {
      statusText = 'Draw';
    }
    statusType = 'draw';
  } else if (chess.isCheck()) {
    statusText = 'Check!';
    statusType = 'check';
  } else if (isThinking) {
    statusText = 'AI is thinking...';
    statusType = 'thinking';
  } else if (isPlayerTurn) {
    statusText = 'Your turn';
    statusType = 'your-turn';
  } else {
    statusText = "Opponent's turn";
    statusType = 'opponent-turn';
  }

  return (
    <div className={`game-status game-status-${statusType}`} id="game-status">
      {statusType === 'thinking' && <span className="spinner spinner-sm"></span>}
      {statusType === 'check' && <span className="status-icon">⚠</span>}
      {statusType === 'checkmate' && <span className="status-icon">👑</span>}
      {statusType === 'draw' && <span className="status-icon">🤝</span>}
      <span className="status-text">{statusText}</span>
    </div>
  );
}
