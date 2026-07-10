import React, { useEffect } from 'react';

export default function Modal({ open, onClose, title, actions = null, children }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal island" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="ui-modal__header">
            <h2 className="ui-modal__title">{title}</h2>
          </div>
        )}
        {children}
        {actions && <div className="ui-modal__actions">{actions}</div>}
      </div>
    </div>
  );
}
