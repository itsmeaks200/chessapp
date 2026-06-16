import { useState, useCallback } from 'react';

export default function useAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return null;
      }
      localStorage.setItem('token', data.token);
      return { token: data.token, username: data.username, elo: data.elo };
    } catch (err) {
      setError('Network error. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return null;
      }
      localStorage.setItem('token', data.token);
      return { token: data.token, username: data.username, elo: data.elo };
    } catch (err) {
      setError('Network error. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
  }, []);

  const deleteAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 204) {
        logout();
        return true;
      }
      const data = await res.json();
      setError(data.error || 'Failed to delete account');
      return false;
    } catch (err) {
      setError('Network error. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [logout]);

  return { login, register, logout, deleteAccount, loading, error, setError };
}
