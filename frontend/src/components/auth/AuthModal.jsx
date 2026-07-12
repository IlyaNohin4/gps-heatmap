import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import useAuthStore from '../../store/authStore.js';
import { login as apiLogin, register as apiRegister, forgotPassword } from '../../api/auth.js';
import Modal from '../../ui/Modal.jsx';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';

const styles = {
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 'var(--space-1)',
    color: 'var(--text)',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
  },
  tabs: {
    display: 'flex',
    gap: 'var(--space-1)',
    marginBottom: 'var(--space-4)',
    background: 'var(--bg)',
    borderRadius: 10,
    padding: 'var(--space-1)',
  },
  field: {
    marginBottom: 'var(--space-3)',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-1)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  eyeBtn: {
    position: 'absolute',
    right: 'var(--space-2)',
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
    marginTop: 'var(--space-1)',
    padding: 0,
  },
  submitBtn: {
    width: '100%',
    marginTop: 'var(--space-4)',
  },
};

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder || 'Password'}
        leftIcon={<Lock size={15} />}
        style={{ paddingRight: 34 }}
      />
      <button type="button" style={styles.eyeBtn} onClick={() => setShow(!show)}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export default function AuthModal() {
  const { t } = useTranslation();
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
    if (!email || !password) return toast.error(t('validation.fill_all_fields'));
    setLoading(true);
    try {
      const data = await apiLogin(email, password);
      storeLogin(data.access_token, data.user);
      toast.success(t('auth.login_success'));
    } catch (err) {
      toast.error(t('auth.login_error', { detail: err.response?.data?.detail ? ': ' + err.response.data.detail : '' }));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!email || !password || !confirmPassword) return toast.error(t('validation.fill_all_fields'));
    if (password !== confirmPassword) return toast.error(t('validation.passwords_mismatch'));
    if (password.length < 8) return toast.error(t('validation.password_min_length'));
    setLoading(true);
    try {
      const data = await apiRegister(email, password);
      storeLogin(data.access_token, data.user);
      toast.success(t('auth.register_success'));
    } catch (err) {
      toast.error(t('auth.register_error', { detail: err.response?.data?.detail ? ': ' + err.response.data.detail : '' }));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    if (!forgotEmail) return toast.error(t('validation.enter_email'));
    setLoading(true);
    try {
      await forgotPassword(forgotEmail);
      toast.success(t('auth.reset_email_sent'));
      setForgotMode(false);
    } catch (err) {
      toast.error(t('auth.reset_email_error', { detail: err.response?.data?.detail ? ': ' + err.response.data.detail : '' }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={true}>
      {forgotMode ? (
        <>
          <div style={styles.title}>Reset password</div>
          <div style={styles.subtitle}>We'll send a link to your email</div>
          <form onSubmit={handleForgot}>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <Input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail size={15} />}
              />
            </div>
            <Button type="submit" style={styles.submitBtn} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
            <button type="button" style={{ ...styles.forgot, display: 'block', marginTop: 'var(--space-3)' }} onClick={() => setForgotMode(false)}>
              Back to login
            </button>
          </form>
        </>
      ) : (
        <>
          <div style={styles.title}>GPS Heatmap</div>
          <div style={styles.subtitle}>Sign in to track your adventures</div>
          <div style={styles.tabs}>
            <Button variant="ghost" active={tab === 'login'} style={{ flex: 1 }} onClick={() => setTab('login')}>Login</Button>
            <Button variant="ghost" active={tab === 'register'} style={{ flex: 1 }} onClick={() => setTab('register')}>Register</Button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin}>
              <div style={styles.field}>
                <label style={styles.label}>Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  leftIcon={<Mail size={15} />}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Password</label>
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" style={styles.forgot} onClick={() => setForgotMode(true)}>
                  Forgot password?
                </button>
              </div>
              <Button type="submit" style={styles.submitBtn} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div style={styles.field}>
                <label style={styles.label}>Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  leftIcon={<Mail size={15} />}
                />
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
              <Button type="submit" style={styles.submitBtn} disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
