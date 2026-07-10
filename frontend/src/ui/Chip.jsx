import React from 'react';

export default function Chip({ active = false, className = '', children, ...rest }) {
  const classes = ['ui-chip', active ? 'ui-chip--active' : '', className].filter(Boolean).join(' ');
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
