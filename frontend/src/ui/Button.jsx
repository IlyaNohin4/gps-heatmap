import React from 'react';

export default function Button({
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'ui-btn',
    `ui-btn--${variant}`,
    size === 'sm' ? 'ui-btn--sm' : '',
    iconOnly ? 'ui-btn--icon-only' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
