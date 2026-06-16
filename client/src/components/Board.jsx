import { useState, useMemo } from 'react';
import { Chess } from 'chess.js';
import {
  SQUARE_SIZE,
  BOARD_SIZE,
  LIGHT_SQUARE,
  DARK_SQUARE,
  SELECTED_SQUARE,
  LEGAL_MOVE_COLOR,
  LAST_MOVE_COLOR,
  PIECE_UNICODE,
  FILES,
  RANKS
} from '../constants';
import './Board.css';

export default function Board({ fen, onMove, orientation = 'white', disabled = false, lastMove = null }) {
  const [selectedSquare, setSelectedSquare] = useState(null);

  // Parse FEN to get piece positions
  const pieces = useMemo(() => {
    const map = {};
    const placement = fen.split(' ')[0];
    let rank = 7;
    let file = 0;

    for (const ch of placement) {
      if (ch === '/') {
        rank--;
        file = 0;
      } else if (ch >= '1' && ch <= '8') {
        file += parseInt(ch);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        const type = ch.toUpperCase();
        const square = FILES[file] + RANKS[rank];
        map[square] = { color, type, key: color + type };
        file++;
      }
    }
    return map;
  }, [fen]);

  // Get whose turn it is from FEN
  const turn = fen.split(' ')[1] || 'w';

  // Compute legal moves for selected square
  const legalMoves = useMemo(() => {
    if (!selectedSquare) return [];
    try {
      const chess = new Chess(fen);
      const moves = chess.moves({ square: selectedSquare, verbose: true });
      return moves.map(m => m.to);
    } catch {
      return [];
    }
  }, [fen, selectedSquare]);

  // Convert square to SVG coordinates
  const squareToCoords = (sq) => {
    const fileIdx = FILES.indexOf(sq[0]);
    const rankIdx = RANKS.indexOf(sq[1]);

    const col = orientation === 'white' ? fileIdx : 7 - fileIdx;
    const row = orientation === 'white' ? 7 - rankIdx : rankIdx;

    return { x: col * SQUARE_SIZE, y: row * SQUARE_SIZE };
  };

  const handleSquareClick = (square) => {
    if (disabled) return;

    const piece = pieces[square];

    if (selectedSquare) {
      // Second click
      if (legalMoves.includes(square)) {
        // Valid move destination
        onMove(selectedSquare, square);
        setSelectedSquare(null);
        return;
      }

      // Clicked own piece — reselect
      if (piece && piece.color === turn) {
        setSelectedSquare(square);
        return;
      }

      // Clicked empty or opponent — deselect
      setSelectedSquare(null);
      return;
    }

    // First click — select own piece
    if (piece && piece.color === turn) {
      setSelectedSquare(square);
    }
  };

  // Render all 64 squares
  const squares = [];
  const pieceElements = [];
  const highlightElements = [];
  const labelElements = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const fileIdx = orientation === 'white' ? col : 7 - col;
      const rankIdx = orientation === 'white' ? 7 - row : row;
      const square = FILES[fileIdx] + RANKS[rankIdx];
      const x = col * SQUARE_SIZE;
      const y = row * SQUARE_SIZE;

      const isLight = (fileIdx + rankIdx) % 2 === 1;
      const isSelected = selectedSquare === square;
      const isLegalTarget = legalMoves.includes(square);
      const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);

      // Base square
      squares.push(
        <rect
          key={`sq-${square}`}
          x={x}
          y={y}
          width={SQUARE_SIZE}
          height={SQUARE_SIZE}
          fill={isLight ? LIGHT_SQUARE : DARK_SQUARE}
          onClick={() => handleSquareClick(square)}
          style={{ cursor: disabled ? 'default' : 'pointer' }}
        />
      );

      // Last move highlight
      if (isLastMoveSquare) {
        highlightElements.push(
          <rect
            key={`last-${square}`}
            x={x}
            y={y}
            width={SQUARE_SIZE}
            height={SQUARE_SIZE}
            fill={LAST_MOVE_COLOR}
            pointerEvents="none"
          />
        );
      }

      // Selected square highlight
      if (isSelected) {
        highlightElements.push(
          <rect
            key={`sel-${square}`}
            x={x}
            y={y}
            width={SQUARE_SIZE}
            height={SQUARE_SIZE}
            fill={SELECTED_SQUARE}
            pointerEvents="none"
          />
        );
      }

      // Legal move indicators
      if (isLegalTarget) {
        const hasPiece = pieces[square];
        if (hasPiece) {
          // Capture ring
          highlightElements.push(
            <rect
              key={`cap-${square}`}
              x={x + 3}
              y={y + 3}
              width={SQUARE_SIZE - 6}
              height={SQUARE_SIZE - 6}
              fill="none"
              stroke={LEGAL_MOVE_COLOR}
              strokeWidth="5"
              rx="2"
              pointerEvents="none"
            />
          );
        } else {
          // Move dot
          highlightElements.push(
            <circle
              key={`dot-${square}`}
              cx={x + SQUARE_SIZE / 2}
              cy={y + SQUARE_SIZE / 2}
              r={SQUARE_SIZE * 0.15}
              fill={LEGAL_MOVE_COLOR}
              pointerEvents="none"
            />
          );
        }
      }

      // Piece rendering
      const piece = pieces[square];
      if (piece) {
        const unicode = PIECE_UNICODE[piece.key];
        const isWhitePiece = piece.color === 'w';

        pieceElements.push(
          <g key={`piece-${square}`} onClick={() => handleSquareClick(square)}
             style={{ cursor: disabled ? 'default' : 'pointer' }}>
            {/* Shadow for white pieces */}
            {isWhitePiece && (
              <text
                x={x + SQUARE_SIZE / 2 + 1}
                y={y + SQUARE_SIZE / 2 + 1}
                fontSize="44"
                textAnchor="middle"
                dominantBaseline="central"
                fill="#333333"
                pointerEvents="none"
                style={{ userSelect: 'none' }}
              >
                {unicode}
              </text>
            )}
            <text
              x={x + SQUARE_SIZE / 2}
              y={y + SQUARE_SIZE / 2}
              fontSize="44"
              textAnchor="middle"
              dominantBaseline="central"
              fill={isWhitePiece ? '#FFFFFF' : '#1a1a1a'}
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              {unicode}
            </text>
          </g>
        );
      }

      // Coordinate labels
      if (col === 0) {
        labelElements.push(
          <text
            key={`rank-${rankIdx}`}
            x={x + 4}
            y={y + 14}
            fontSize="11"
            fontWeight="600"
            fontFamily="var(--font-mono, monospace)"
            fill={isLight ? DARK_SQUARE : LIGHT_SQUARE}
            opacity="0.8"
            pointerEvents="none"
            style={{ userSelect: 'none' }}
          >
            {RANKS[rankIdx]}
          </text>
        );
      }
      if (row === 7) {
        labelElements.push(
          <text
            key={`file-${fileIdx}`}
            x={x + SQUARE_SIZE - 8}
            y={y + SQUARE_SIZE - 5}
            fontSize="11"
            fontWeight="600"
            fontFamily="var(--font-mono, monospace)"
            fill={isLight ? DARK_SQUARE : LIGHT_SQUARE}
            opacity="0.8"
            pointerEvents="none"
            style={{ userSelect: 'none' }}
          >
            {FILES[fileIdx]}
          </text>
        );
      }
    }
  }

  return (
    <div className="board-wrapper" id="chess-board">
      <svg
        width={BOARD_SIZE}
        height={BOARD_SIZE}
        viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
        className="board-svg"
      >
        {squares}
        {highlightElements}
        {pieceElements}
        {labelElements}
      </svg>
    </div>
  );
}
