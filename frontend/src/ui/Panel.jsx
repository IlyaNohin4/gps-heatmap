import React from 'react';

export default function Panel({ className = '', children, ...rest }) {
  return (
    <div className={['island', 'ui-panel', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
