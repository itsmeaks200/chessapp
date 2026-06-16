import { useState } from 'react';
import useAuth from '../hooks/useAuth';
import './Auth.css';

export default function Auth({ onSuccess }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, register, loading, error, setError } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const result = mode === 'login'
      ? await login(username, password)
      : await register(username, password);

    if (result) {
      onSuccess(result);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setUsername('');
    setPassword('');
  };

  return (
    <div className="auth-page page-center">
      {/* Floating chess pieces background decoration */}
      <div className="auth-bg-decor" aria-hidden="true">
        <span className="floating-piece fp-1">♚</span>
        <span className="floating-piece fp-2">♛</span>
        <span className="floating-piece fp-3">♞</span>
        <span className="floating-piece fp-4">♜</span>
        <span className="floating-piece fp-5">♝</span>
        <span className="floating-piece fp-6">♟</span>
      </div>

      <div className="auth-container animate-slide-up">
        {/* Logo / Brand */}
        <div className="auth-header">
          <div className="auth-logo">
            <span className="auth-logo-icon">♔</span>
          </div>
          <h1 className="auth-title">Chess Arena</h1>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Welcome back, strategist'
              : 'Begin your journey'}
          </p>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} id="auth-form">
          <div className="input-group">
            <label className="input-label" htmlFor="auth-username">
              Username
            </label>
            <input
              id="auth-username"
              className="input-field"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              maxLength={20}
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              className="input-field"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={4}
            />
          </div>

          {error && (
            <div className="alert alert-error animate-fade-in" role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 4.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full auth-submit"
            disabled={loading}
            id="auth-submit-btn"
          >
            {loading ? (
              <>
                <span className="spinner spinner-sm"></span>
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              mode === 'login' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        {/* Toggle */}
        <div className="auth-footer">
          <span className="text-muted">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button
            type="button"
            className="auth-toggle-btn"
            onClick={toggleMode}
            id="auth-toggle-btn"
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </div>

        {/* Decorative bottom bar */}
        <div className="auth-accent-bar"></div>
      </div>
    </div>
  );
}
