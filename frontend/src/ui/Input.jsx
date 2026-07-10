import React from 'react';

export default function Input({ leftIcon = null, className = '', ...rest }) {
  return (
    <div className="ui-input-wrap">
      {leftIcon && <span className="ui-input-wrap__icon">{leftIcon}</span>}
      <input
        className={['ui-input', leftIcon ? 'ui-input--with-icon' : '', className].filter(Boolean).join(' ')}
        {...rest}
      />
    </div>
  );
}
