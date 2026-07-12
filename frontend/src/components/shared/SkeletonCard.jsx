import React from 'react';

export default function SkeletonCard() {
  return (
    <div style={{
      borderRadius: 12,
      padding: 'var(--space-3) var(--space-4)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
    }}>
      {[80, 50, 60].map((w, i) => (
        <div key={i} style={{
          height: 12,
          width: `${w}%`,
          borderRadius: 6,
          background: 'var(--border)',
          marginBottom: i < 2 ? 'var(--space-2)' : 0,
          animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      ))}
    </div>
  );
}
