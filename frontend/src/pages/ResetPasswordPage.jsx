import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { resetPassword } from '../api/auth.js';
import { apiErrorMessage } from '../utils/apiError.js';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // No <ToastContainer> exists on this route (it's mounted inside MainPage,
  // not at the App root) — errors/validation must render inline here.
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) return setError(t('auth.password_too_short'));
    if (password !== confirmPassword) return setError(t('auth.passwords_dont_match'));
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      const msg = apiErrorMessage(err, '');
      setError(t('auth.password_reset_error', { detail: msg ? ': ' + msg : '' }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 'var(--space-4)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--space-5)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 'var(--space-1)', color: 'var(--text)' }}>
          {t('auth.reset_password_title')}
        </div>

        {done ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              {t('auth.password_reset_success')}
            </div>
            <Button style={{ width: '100%' }} onClick={() => navigate('/')}>
              {t('auth.back_to_login')}
            </Button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              {t('auth.reset_password_subtitle')}
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 'var(--space-3)', position: 'relative' }}>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.new_password')}
                  leftIcon={<Lock size={15} />}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute', right: 'var(--space-2)', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.confirm_new_password')}
                  leftIcon={<Lock size={15} />}
                />
              </div>
              {error && (
                <div style={{ fontSize: 13, color: '#ff3b30', marginBottom: 'var(--space-3)' }}>
                  {error}
                </div>
              )}
              <Button type="submit" style={{ width: '100%' }} disabled={loading}>
                {loading ? t('auth.resetting') : t('auth.reset_password_action')}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
