import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import Board from '../components/Board';
import MoveHistory from '../components/MoveHistory';
import GameStatus from '../components/GameStatus';
import useChessAI from '../hooks/useChessAI';
import { getEloBracket } from '../constants';
import './Game.css';

export default function Game({ username, elo, onEloUpdate, onReturnToLobby, mode = 'ai' }) {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moves, setMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState(null); // { score, newElo, eloDelta }
  const [showResult, setShowResult] = useState(false);

  const { getAIMove, cancelAIMove, isThinking, error: aiError } = useChessAI();
  const gameIdRef = useRef(0); // Tracks game instance to prevent stale AI moves

  const isPlayerTurn = chess.turn() === 'w';

  // ─── Request AI Move ─────────────────────────────────────────
  const requestAIMove = useCallback(async (currentFen, currentMoves) => {
    const currentGameId = gameIdRef.current;

    const move = await getAIMove(currentFen, currentMoves, elo);

    // Guard: game was reset while AI was thinking
    if (gameIdRef.current !== currentGameId || !move) return;

    try {
      const result = chess.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move[4] || 'q'
      });

      if (result) {
        const newFen = chess.fen();
        setFen(newFen);
        setMoves(prev => [...prev, result.san]);
        setLastMove({ from: move.slice(0, 2), to: move.slice(2, 4) });

        if (chess.isGameOver()) {
          handleGameOver();
        }
      }
    } catch (err) {
      console.error('Failed to apply AI move:', err.message);
    }
  }, [chess, elo, getAIMove]);

  // ─── Handle Player Move ──────────────────────────────────────
  const handleMove = useCallback((from, to) => {
    if (gameOver || !isPlayerTurn) return;

    const result = chess.move({ from, to, promotion: 'q' });
    if (!result) return; // Illegal move

    const newFen = chess.fen();
    const newMoves = [...moves, result.san];

    setFen(newFen);
    setMoves(newMoves);
    setLastMove({ from, to });

    if (chess.isGameOver()) {
      handleGameOver();
      return;
    }

    // Request AI response
    if (mode === 'ai') {
      requestAIMove(newFen, newMoves);
    }
  }, [chess, gameOver, isPlayerTurn, moves, mode, requestAIMove]);

  // ─── Handle Game Over ────────────────────────────────────────
  const handleGameOver = useCallback(async () => {
    setGameOver(true);

    let score;
    if (chess.isCheckmate()) {
      // The side whose turn it is has been checkmated
      score = chess.turn() === 'w' ? 0 : 1; // Player is white
    } else {
      score = 0.5; // Draw
    }

    // Update ELO
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/game/result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ score })
      });

      if (res.ok) {
        const data = await res.json();
        setResult({ score, newElo: data.newElo, eloDelta: data.eloDelta });
        onEloUpdate(data.newElo);
      }
    } catch (err) {
      console.error('Failed to update ELO:', err.message);
    }

    setShowResult(true);
  }, [chess, onEloUpdate]);

  // ─── Reset Game ──────────────────────────────────────────────
  const handleReset = useCallback(() => {
    cancelAIMove();
    gameIdRef.current++; // Invalidate any pending AI response
    chess.reset();
    setFen(chess.fen());
    setMoves([]);
    setLastMove(null);
    setGameOver(false);
    setResult(null);
    setShowResult(false);
  }, [chess, cancelAIMove]);

  // Determine result text
  const getResultText = () => {
    if (!result) return '';
    if (result.score === 1) return 'You Win!';
    if (result.score === 0) return 'You Lose';
    return 'Draw';
  };

  const getResultEmoji = () => {
    if (!result) return '';
    if (result.score === 1) return '🏆';
    if (result.score === 0) return '😔';
    return '🤝';
  };

  return (
    <div className="game-page">
      <div className="game-layout">
        {/* Board Section */}
        <div className="game-board-section">
          {/* Opponent label */}
          <div className="player-label opponent-label">
            <span className="player-piece">♚</span>
            <span className="player-name">
              {mode === 'ai' ? 'AI Engine' : 'Opponent'}
            </span>
            {mode === 'ai' && (
              <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>
                {getEloBracket(elo).label} difficulty
              </span>
            )}
          </div>

          <Board
            fen={fen}
            onMove={handleMove}
            orientation="white"
            disabled={gameOver || !isPlayerTurn || isThinking}
            lastMove={lastMove}
          />

          {/* Player label */}
          <div className="player-label player-self-label">
            <span className="player-piece">♔</span>
            <span className="player-name">{username}</span>
            <span className="badge badge-accent">{elo} ELO</span>
          </div>
        </div>

        {/* Side Panel */}
        <div className="game-side-panel">
          <GameStatus
            chess={chess}
            isThinking={isThinking}
            isPlayerTurn={isPlayerTurn}
          />

          <MoveHistory moves={moves} />

          {aiError && (
            <div className="alert alert-error animate-fade-in">
              AI Error: {aiError}
            </div>
          )}

          <div className="game-actions">
            <button
              className="btn btn-secondary btn-full"
              onClick={handleReset}
              id="reset-btn"
            >
              ↺ New Game
            </button>
            <button
              className="btn btn-ghost btn-full"
              onClick={onReturnToLobby}
              id="lobby-btn"
            >
              ← Back to Lobby
            </button>
          </div>
        </div>
      </div>

      {/* Result Modal */}
      {showResult && (
        <div className="result-overlay animate-fade-in" onClick={() => setShowResult(false)}>
          <div className="result-modal card card-glow animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="result-emoji">{getResultEmoji()}</div>
            <h2 className="result-title">{getResultText()}</h2>

            {result && (
              <div className="result-elo">
                <span className="result-elo-label">ELO Rating</span>
                <div className="result-elo-change">
                  <span className="result-elo-old">{result.newElo - result.eloDelta}</span>
                  <span className="result-elo-arrow">→</span>
                  <span className="result-elo-new">{result.newElo}</span>
                  <span className={`result-elo-delta ${result.eloDelta >= 0 ? 'positive' : 'negative'}`}>
                    ({result.eloDelta >= 0 ? '+' : ''}{result.eloDelta})
                  </span>
                </div>
              </div>
            )}

            <div className="result-actions">
              <button className="btn btn-primary btn-full" onClick={handleReset}>
                Play Again
              </button>
              <button className="btn btn-ghost btn-full" onClick={onReturnToLobby}>
                Back to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
