import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { X, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import useAuthStore from '../../store/authStore.js';
import { login as apiLogin, register as apiRegister, forgotPassword } from '../../api/auth.js';

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    padding: '28px 28px 24px',
    position: 'relative',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 4,
    color: 'var(--text)',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 20,
  },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 20,
    background: 'var(--bg)',
    borderRadius: 10,
    padding: 4,
  },
  tab: (active) => ({
    flex: 1,
    padding: '7px 0',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    background: active ? 'var(--surface)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-secondary)',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
    transition: 'all 0.15s',
    cursor: 'pointer',
    border: 'none',
  }),
  field: {
    marginBottom: 12,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  inputWrap: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-secondary)',
    pointerEvents: 'none',
  },
  input: {
    paddingLeft: 34,
    paddingRight: 34,
  },
  eyeBtn: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  forgot: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    fontSize: 13,
    cursor: 'pointer',
    marginTop: 4,
    padding: 0,
  },
  submitBtn: {
    width: '100%',
    marginTop: 16,
    padding: '11px',
    fontSize: 15,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 8,
    padding: 4,
  },
};

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={styles.inputWrap}>
      <span style={styles.inputIcon}><Lock size={15} /></span>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder || 'Password'}
        style={styles.input}
      />
      <button type="button" style={styles.eyeBtn} onClick={() => setShow(!show)}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export default function AuthModal() {
  const { isAuthenticated, login: storeLogin } = useAuthStore();
  const [tab, setTab] = useState('login');
  const [forgotMode, setForgotMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');

  if (isAuthenticated) return null;

  async function handleLogin(e) {
    e.preventDefault();
    if (!email || !password) return toast.error('Please fill in all fields');
    setLoading(true);
    try {
      const data = await apiLogin(email, password);
      storeLogin(data.access_token, data.user);
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!email || !password || !confirmPassword) return toast.error('Please fill in all fields');
    if (password !== confirmPassword) return toast.error('Passwords do not match');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    setLoading(true);
    try {
      const data = await apiRegister(email, password);
      storeLogin(data.access_token, data.user);
      toast.success('Account created!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    if (!forgotEmail) return toast.error('Enter your email');
    setLoading(true);
    try {
      await forgotPassword(forgotEmail);
      toast.success('Reset link sent — check your inbox');
      setForgotMode(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.overlay}>
      <div className="island" style={styles.modal}>
        {forgotMode ? (
          <>
            <div style={styles.title}>Reset password</div>
            <div style={styles.subtitle}>We'll send a link to your email</div>
            <form onSubmit={handleForgot}>
              <div style={styles.field}>
                <label style={styles.label}>Email</label>
                <div style={styles.inputWrap}>
                  <span style={styles.inputIcon}><Mail size={15} /></span>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={styles.input}
                  />
                </div>
              </div>
              <button type="submit" className="btn-primary" style={styles.submitBtn} disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <button type="button" style={{ ...styles.forgot, display: 'block', marginTop: 12 }} onClick={() => setForgotMode(false)}>
                Back to login
              </button>
            </form>
          </>
        ) : (
          <>
            <div style={styles.title}>GPS Heatmap</div>
            <div style={styles.subtitle}>Sign in to track your adventures</div>
            <div style={styles.tabs}>
              <button style={styles.tab(tab === 'login')} onClick={() => setTab('login')}>Login</button>
              <button style={styles.tab(tab === 'register')} onClick={() => setTab('register')}>Register</button>
            </div>

            {tab === 'login' ? (
              <form onSubmit={handleLogin}>
                <div style={styles.field}>
                  <label style={styles.label}>Email</label>
                  <div style={styles.inputWrap}>
                    <span style={styles.inputIcon}><Mail size={15} /></span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={styles.input}
                    />
                  </div>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Password</label>
                  <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" style={styles.forgot} onClick={() => setForgotMode(true)}>
                    Forgot password?
                  </button>
                </div>
                <button type="submit" className="btn-primary" style={styles.submitBtn} disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div style={styles.field}>
                  <label style={styles.label}>Email</label>
                  <div style={styles.inputWrap}>
                    <span style={styles.inputIcon}><Mail size={15} /></span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={styles.input}
                    />
                  </div>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Password</label>
                  <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Confirm password</label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                  />
                </div>
                <button type="submit" className="btn-primary" style={styles.submitBtn} disabled={loading}>
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
