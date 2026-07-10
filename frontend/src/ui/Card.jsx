import React from 'react';

export default function Card({ className = '', children, ...rest }) {
  return (
    <div className={['ui-card', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
