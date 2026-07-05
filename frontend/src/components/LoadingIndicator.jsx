import React from 'react';
import { Loader } from 'lucide-react';

export default function LoadingIndicator({ isLoading }) {
  if (!isLoading) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 440,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#ffffff',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      zIndex: 950,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>
      <Loader
        size={16}
        style={{
          animation: 'spin 1s linear infinite',
          flexShrink: 0,
        }}
      />
      <span style={{
        fontSize: 13,
        color: 'var(--text)',
        fontWeight: 500,
      }}>
        Loading tracks...
      </span>
    </div>
  );
}
