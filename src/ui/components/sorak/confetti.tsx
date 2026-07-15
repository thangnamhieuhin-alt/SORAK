'use client';

import { useEffect, useState } from 'react';

const COLORS = ['#f43f5e', '#e879f9', '#fbbf24', '#34d399', '#38bdf8'];
const PIECE_COUNT = 36;

type Piece = {
  id: string;
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
};

function makePieces(): Piece[] {
  const seed = Date.now();
  return Array.from({ length: PIECE_COUNT }, (_, index) => ({
    id: `${seed}-${index}`,
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 1.6 + Math.random() * 1.2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotate: Math.random() * 360,
  }));
}

export function Confetti({ active }: { active: boolean }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!active) {
      setPieces([]);
      return;
    }
    setPieces(makePieces());
    const timer = setTimeout(() => setPieces([]), 3200);
    return () => clearTimeout(timer);
  }, [active]);

  if (pieces.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <style>{`@keyframes sorak-confetti-fall{0%{transform:translateY(-10vh) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}`}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: 9,
            height: 14,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rotate}deg)`,
            animation: `sorak-confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}
