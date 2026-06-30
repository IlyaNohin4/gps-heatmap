import React, { useState } from 'react';
import {
  Settings, ChevronDown, ChevronUp, Sun, Moon,
  LogOut, User, Key, AlertTriangle, Map, Mail,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store/appStore.js';
import useAuthStore from '../../store/authStore.js';
import client from '../../api/client.js';
import { updatePrefs } from '../../api/auth.js';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'zh', label: '中文' },
];

export default function TopIsland() {
  const { theme, units, language, setTheme, setUnits, setLanguage } = useAppStore();
  const { isAuthenticated, user, logout, setUser } = useAuthStore();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function savePref(patch) {
    try {
      const updated = await updatePrefs(patch);
      setUser(updated);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save setting');
    }
  }

  function handleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('gps_theme', next); } catch (_) {}
    if (isAuthenticated) savePref({ theme: next });
  }

  function handleDistanceUnit(val) {
    setUnits({ distance: val });
    if (isAuthenticated) savePref({ unit_distance: val });
  }

  function handleSpeedUnit(val) {
    setUnits({ speed: val });
    if (isAuthenticated) savePref({ unit_speed: val });
  }

  function handleLanguage(code) {
    setLanguage(code);
    i18n.changeLanguage(code);
    if (isAuthenticated) savePref({ language: code });
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!oldPass || !newPass) return toast.error(t('toast.password_failed'));
    try {
      await client.post('/api/auth/change-password', { old_password: oldPass, new_password: newPass });
      toast.success(t('toast.password_changed'));
      setOldPass(''); setNewPass(''); setChangePassOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || t('toast.password_failed'));
    }
  }

  async function handleChangeEmail(e) {
    e.preventDefault();
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    try {
      const updated = await updatePrefs({ email: trimmed });
      setUser(updated);
      toast.success(t('toast.email_updated'));
      setNewEmail('');
      setChangeEmailOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || t('toast.email_failed'));
    }
  }

  async function handleDeleteAccount() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 4000);
      return;
    }
    try {
      await client.delete('/api/auth/account');
      logout();
      toast.success(t('toast.account_deleted'));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete account');
    }
  }

  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 };
  const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 8px' };
  const chipGroup = { display: 'flex', gap: 4 };
  const chip = (active) => ({
    padding: '5px 11px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    background: active ? 'var(--accent)' : 'var(--bg)',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <div style={{
      position: 'fixed',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      minWidth: 260,
    }}>
      <div className="island" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Map size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', flex: 1, textAlign: 'left' }}>GPS Heatmap</span>
          <Settings size={15} color="var(--text-secondary)" />
          {open ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
        </button>

        {open && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={sectionLabel}>{t('settings.display')}</div>

            <div style={row}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('settings.distance')}</span>
              <div style={chipGroup}>
                <button style={chip(units.distance === 'km')} onClick={() => handleDistanceUnit('km')}>KM</button>
                <button style={chip(units.distance === 'mi')} onClick={() => handleDistanceUnit('mi')}>MI</button>
              </div>
            </div>

            <div style={row}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('settings.speed')}</span>
              <div style={chipGroup}>
                <button style={chip(units.speed === 'kmh')} onClick={() => handleSpeedUnit('kmh')}>KPH</button>
                <button style={chip(units.speed === 'mph')} onClick={() => handleSpeedUnit('mph')}>MPH</button>
                <button style={chip(units.speed === 'ms')} onClick={() => handleSpeedUnit('ms')}>MPS</button>
              </div>
            </div>

            <div style={row}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('settings.theme')}</span>
              <button onClick={handleTheme} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'var(--bg)', border: 'none', cursor: 'pointer', color: 'var(--text)',
              }}>
                {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
                {theme === 'light' ? t('settings.dark') : t('settings.light')}
              </button>
            </div>

            <div style={row}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('settings.language')}</span>
              <select
                value={language}
                onChange={(e) => handleLanguage(e.target.value)}
                style={{ width: 'auto', padding: '5px 8px', fontSize: 12 }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            {isAuthenticated && (
              <>
                <div style={sectionLabel}>{t('settings.account')}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <User size={13} /> {user?.email}
                </div>

                <button
                  style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}
                  onClick={() => { setChangeEmailOpen(!changeEmailOpen); setChangePassOpen(false); }}
                >
                  <Mail size={13} /> {t('settings.change_email')}
                </button>

                {changeEmailOpen && (
                  <form onSubmit={handleChangeEmail} style={{ marginBottom: 10 }}>
                    <input
                      type="email"
                      placeholder={t('toast.email_placeholder')}
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      style={{ marginBottom: 8 }}
                      autoFocus
                    />
                    <button type="submit" className="btn-primary" style={{ width: '100%', padding: '8px' }}>
                      {t('settings.update')}
                    </button>
                  </form>
                )}

                <button
                  style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}
                  onClick={() => { setChangePassOpen(!changePassOpen); setChangeEmailOpen(false); }}
                >
                  <Key size={13} /> {t('settings.change_password')}
                </button>

                {changePassOpen && (
                  <form onSubmit={handleChangePassword} style={{ marginBottom: 10 }}>
                    <input
                      type="password"
                      placeholder={t('settings.current_password')}
                      value={oldPass}
                      onChange={(e) => setOldPass(e.target.value)}
                      style={{ marginBottom: 6 }}
                    />
                    <input
                      type="password"
                      placeholder={t('settings.new_password')}
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      style={{ marginBottom: 8 }}
                    />
                    <button type="submit" className="btn-primary" style={{ width: '100%', padding: '8px' }}>
                      {t('settings.update')}
                    </button>
                  </form>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    className="btn-secondary"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px' }}
                    onClick={() => { logout(); toast.info(t('toast.signed_out')); }}
                  >
                    <LogOut size={13} /> {t('settings.sign_out')}
                  </button>
                  <button
                    className="btn-danger"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', fontSize: 12 }}
                    onClick={handleDeleteAccount}
                  >
                    <AlertTriangle size={13} />
                    {deleteConfirm ? t('settings.confirm') : t('settings.delete_account')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
