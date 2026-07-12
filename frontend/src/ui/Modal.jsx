import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Button from './Button.jsx';

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

  return createPortal(
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal island" onClick={(e) => e.stopPropagation()}>
        {(title || onClose) && (
          <div className="ui-modal__header">
            {title && <h2 className="ui-modal__title">{title}</h2>}
            {onClose && (
              <Button variant="ghost" iconOnly size="sm" onClick={onClose} title="Close">
                <X size={16} />
              </Button>
            )}
          </div>
        )}
        {children}
        {actions && <div className="ui-modal__actions">{actions}</div>}
      </div>
    </div>,
    document.body
  );
}
