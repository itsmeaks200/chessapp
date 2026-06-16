// ─── Board Geometry ──────────────────────────────────────────
export const SQUARE_SIZE = 70;
export const BOARD_SIZE = SQUARE_SIZE * 8;
export const BOARD_PADDING = 24;

// ─── Square Colors ───────────────────────────────────────────
export const LIGHT_SQUARE = '#F0D9B5';
export const DARK_SQUARE = '#B58863';
export const SELECTED_SQUARE = 'rgba(255, 255, 0, 0.4)';
export const LEGAL_MOVE_COLOR = 'rgba(0, 0, 0, 0.15)';
export const LAST_MOVE_COLOR = 'rgba(155, 199, 0, 0.41)';

// ─── Piece Unicode Map ───────────────────────────────────────
export const PIECE_UNICODE = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
};

// ─── Files & Ranks ───────────────────────────────────────────
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

// ─── ELO Brackets ────────────────────────────────────────────
export const ELO_BRACKETS = [
  { max: 800,  label: 'Beginner',     color: '#9ca3af' },
  { max: 1000, label: 'Novice',       color: '#4ade80' },
  { max: 1200, label: 'Intermediate', color: '#60a5fa' },
  { max: 1400, label: 'Advanced',     color: '#a78bfa' },
  { max: 1600, label: 'Expert',       color: '#f59e0b' },
  { max: 1800, label: 'Master',       color: '#f87171' },
  { max: Infinity, label: 'Grandmaster', color: '#e8c86a' }
];

export function getEloBracket(elo) {
  return ELO_BRACKETS.find(b => elo < b.max) || ELO_BRACKETS[ELO_BRACKETS.length - 1];
}
