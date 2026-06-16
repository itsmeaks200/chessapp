import { useState, useEffect, useCallback } from 'react';
import Auth from './pages/Auth';
import Game from './pages/Game';
import useAuth from './hooks/useAuth';
import { getEloBracket } from './constants';
import './App.css';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [elo, setElo] = useState(() => Number(localStorage.getItem('elo')) || 800);
  const [view, setView] = useState(token ? 'lobby' : 'auth');
  const [gameMode, setGameMode] = useState(null); // 'ai' | 'multiplayer'
  const [gameId, setGameId] = useState(null);
  const [color, setColor] = useState(null);
  const { logout, deleteAccount } = useAuth();

  // Sync view with token state
  useEffect(() => {
    if (!token) {
      setView('auth');
    }
  }, [token]);

  const handleAuthSuccess = useCallback(({ token: newToken, username: name, elo: playerElo }) => {
    setToken(newToken);
    setUsername(name);
    setElo(playerElo);
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', name);
    localStorage.setItem('elo', String(playerElo));
    setView('lobby');
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setToken(null);
    setUsername('');
    setElo(800);
    localStorage.removeItem('username');
    localStorage.removeItem('elo');
    setView('auth');
  }, [logout]);

  const handleDeleteAccount = useCallback(async () => {
    const success = await deleteAccount();
    if (success) {
      setToken(null);
      setUsername('');
      setElo(800);
      localStorage.removeItem('username');
      localStorage.removeItem('elo');
      setView('auth');
    }
  }, [deleteAccount]);

  const handleEloUpdate = useCallback((newElo) => {
    setElo(newElo);
    localStorage.setItem('elo', String(newElo));
  }, []);

  const handleStartAI = useCallback(() => {
    setGameMode('ai');
    setView('game');
  }, []);

  const handleStartMultiplayer = useCallback((gId, c) => {
    setGameMode('multiplayer');
    setGameId(gId);
    setColor(c);
    setView('game');
  }, []);

  const handleReturnToLobby = useCallback(() => {
    setGameMode(null);
    setGameId(null);
    setColor(null);
    setView('lobby');
  }, []);

  // ─── Auth View ───────────────────────────────────────────────
  if (view === 'auth' || !token) {
    return <Auth onSuccess={handleAuthSuccess} />;
  }

  // ─── Game View ───────────────────────────────────────────────
  if (view === 'game') {
    return (
      <div className="app-layout">
        <header className="app-header">
          <div className="app-header-left">
            <span className="app-brand-icon">♔</span>
            <span className="app-brand-name">Chess Arena</span>
          </div>
          <div className="app-header-right">
            <div className="app-user-info">
              <span className="app-username">{username}</span>
              <span className="badge badge-accent app-elo-badge">
                <span className="elo-dot" style={{ background: getEloBracket(elo).color }}></span>
                {elo} ELO
              </span>
            </div>
          </div>
        </header>
        <Game
          username={username}
          elo={elo}
          onEloUpdate={handleEloUpdate}
          onReturnToLobby={handleReturnToLobby}
          mode={gameMode}
          gameId={gameId}
          color={color}
        />
      </div>
    );
  }

  // ─── Lobby View ──────────────────────────────────────────────
  const bracket = getEloBracket(elo);

  return (
    <div className="app-layout">
      {/* Top Navigation Bar */}
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-brand-icon">♔</span>
          <span className="app-brand-name">Chess Arena</span>
        </div>
        <div className="app-header-right">
          <div className="app-user-info">
            <span className="app-username">{username}</span>
            <span
              className="badge badge-accent app-elo-badge"
              style={{ '--bracket-color': bracket.color }}
            >
              <span className="elo-dot" style={{ background: bracket.color }}></span>
              {elo} ELO
            </span>
          </div>
          <button className="btn btn-ghost" onClick={handleLogout} id="logout-btn">
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Lobby Content */}
      <main className="lobby-temp">
        <div className="lobby-temp-card card card-glow animate-slide-up">
          <div className="lobby-temp-icon">♚</div>
          <h2>Welcome, {username}</h2>
          <p className="text-muted" style={{ marginTop: '8px' }}>
            Your rating: <strong style={{ color: bracket.color }}>{elo}</strong> ({bracket.label})
          </p>

          <div className="lobby-temp-actions">
            <button className="btn btn-primary" onClick={handleStartAI} id="play-ai-btn">
              ♟ Play vs AI
            </button>
            <button className="btn btn-secondary" disabled>
              ⚔ Find Opponent
              <span className="text-xs text-muted" style={{ marginLeft: 4 }}>(Day 7)</span>
            </button>
          </div>

          <div className="lobby-temp-divider"></div>

          <button
            className="btn btn-danger btn-full"
            onClick={() => {
              if (window.confirm('Are you sure? This cannot be undone.')) {
                handleDeleteAccount();
              }
            }}
            id="delete-account-btn"
          >
            Delete Account
          </button>
        </div>
      </main>
    </div>
  );
}
