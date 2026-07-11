import React from 'react';

export default function Button({
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  active = false,
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
    active ? 'ui-btn--active' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
