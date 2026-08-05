import React from 'react';

const Panel = React.forwardRef(function Panel({ className = '', children, ...rest }, ref) {
  return (
    <div ref={ref} className={['island', 'ui-panel', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
});

export default Panel;
