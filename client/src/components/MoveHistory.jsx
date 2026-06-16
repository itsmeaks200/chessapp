import { useEffect, useRef } from 'react';
import './MoveHistory.css';

export default function MoveHistory({ moves }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new moves
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length]);

  // Group moves into pairs (white, black)
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null
    });
  }

  if (moves.length === 0) {
    return (
      <div className="move-history">
        <div className="move-history-header">Moves</div>
        <div className="move-history-empty">No moves yet</div>
      </div>
    );
  }

  return (
    <div className="move-history">
      <div className="move-history-header">Moves</div>
      <div className="move-history-list" ref={scrollRef}>
        {pairs.map((pair) => (
          <div key={pair.number} className="move-pair">
            <span className="move-number">{pair.number}.</span>
            <span className="move-white">{pair.white}</span>
            {pair.black && <span className="move-black">{pair.black}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
