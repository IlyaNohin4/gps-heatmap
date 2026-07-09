import React from 'react';
import i18n from '../i18n/index.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let title, desc, btn;
      try {
        title = i18n.t('errors.app_crashed');
        desc = i18n.t('errors.app_crashed_desc');
        btn = i18n.t('errors.reload_button');
      } catch {
        title = 'Application Error';
        desc = 'Something went wrong. Please reload the page.';
        btn = 'Reload';
      }

      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <h1 style={styles.title}>{title}</h1>
            <p style={styles.desc}>{desc}</p>
            <button style={styles.button} onClick={() => window.location.reload()}>
              {btn}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: 'var(--bg, #f5f5f5)',
  },
  card: {
    backgroundColor: 'var(--surface, #fff)',
    borderRadius: 'var(--radius, 16px)',
    boxShadow: 'var(--shadow, 0 8px 32px rgba(0,0,0,0.12))',
    padding: '32px',
    textAlign: 'center',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: '24px',
    fontWeight: '600',
    color: 'var(--text, #000)',
  },
  desc: {
    margin: '0 0 24px 0',
    fontSize: '16px',
    color: 'var(--text-secondary, #666)',
    lineHeight: '1.5',
  },
  button: {
    padding: '10px 24px',
    fontSize: '16px',
    fontWeight: '500',
    color: '#fff',
    backgroundColor: 'var(--accent, #007AFF)',
    border: 'none',
    borderRadius: 'var(--radius, 16px)',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
};
