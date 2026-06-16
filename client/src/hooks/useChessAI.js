import { useState, useRef, useCallback, useEffect } from 'react';

export default function useChessAI() {
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  const getAIMove = useCallback(async (fen, history, playerElo) => {
    // Cancel any existing request
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    setIsThinking(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/game/ai-move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fen, history, playerElo }),
        signal: controller.signal
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'AI move request failed');
      }

      setIsThinking(false);
      return data.move;
    } catch (err) {
      if (err.name === 'AbortError') {
        // Request was cancelled — do nothing
        return null;
      }
      setError(err.message);
      setIsThinking(false);
      return null;
    }
  }, []);

  const cancelAIMove = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsThinking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  return { getAIMove, cancelAIMove, isThinking, error };
}
