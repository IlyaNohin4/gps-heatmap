import React, { useState, useRef } from 'react';
import {
  ChevronDown, ChevronUp, Sun, Moon,
  LogOut, User, Key, AlertTriangle, Map, Mail, Tags,
} from 'lucide-react';
import { notify as toast } from '../../utils/notify.js';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store/appStore.js';
import useAuthStore from '../../store/authStore.js';
import useMapStore from '../../store/mapStore.js';
import client from '../../api/client.js';
import { updatePrefs } from '../../api/auth.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import Panel from '../../ui/Panel.jsx';
import Button from '../../ui/Button.jsx';
import Chip from '../../ui/Chip.jsx';
import Input from '../../ui/Input.jsx';
import CategoryManageModal from '../modals/CategoryManageModal.jsx';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
];

export default function TopIsland() {
  const { theme, unitSystem, language, expandedTrackInfo, toastPosition, setTheme, setUnitSystem, setLanguage, setExpandedTrackInfo, setToastPosition, activePanel, setActivePanel } = useAppStore();
  const { showStartEndMarkers, toggleStartEndMarkers } = useMapStore();
  const { isAuthenticated, user, logout, setUser } = useAuthStore();
  const notificationsEnabled = user?.notifications_enabled !== false;
  const randomizeTrackColors = user?.randomize_track_colors === true;
  const { t, i18n } = useTranslation();
  const open = activePanel === 'top';
  const langSaveTimer = useRef(null);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailChangePassword, setEmailChangePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);

  async function savePref(patch) {
    try {
      const updated = await updatePrefs(patch);
      setUser(updated);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('settings.save_failed')));
    }
  }

  function handleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('gps_theme', next); } catch (_) {}
    if (isAuthenticated) savePref({ theme: next });
  }

  function handleUnitSystem(system) {
    setUnitSystem(system);
    if (isAuthenticated) savePref({
      unit_distance: system === 'imperial' ? 'mi' : 'km',
      unit_speed: system === 'imperial' ? 'mph' : 'kmh',
    });
  }

  function handleStartEndMarkers(next) {
    if (next === showStartEndMarkers) return;
    toggleStartEndMarkers();
    if (isAuthenticated) savePref({ show_start_end_markers: next });
  }

  function handleNotificationsEnabled(next) {
    if (next === notificationsEnabled) return;
    setUser({ ...user, notifications_enabled: next });
    if (isAuthenticated) savePref({ notifications_enabled: next });
  }

  function handleRandomizeTrackColors(next) {
    if (next === randomizeTrackColors) return;
    setUser({ ...user, randomize_track_colors: next });
    if (isAuthenticated) savePref({ randomize_track_colors: next });
  }

  async function handleLanguage(code) {
    setLanguage(code);
    try {
      await i18n.changeLanguage(code);
    } catch (err) {
      console.error('[i18n] changeLanguage failed', code, err);
    }
    // Debounce the server save to prevent race conditions when the user
    // rapidly switches languages (the last selection wins)
    if (isAuthenticated) {
      clearTimeout(langSaveTimer.current);
      langSaveTimer.current = setTimeout(() => savePref({ language: code }), 300);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!oldPass || !newPass) return toast.error(t('validation.fill_all_fields'));
    try {
      const { data } = await client.post('/api/auth/change-password', { old_password: oldPass, new_password: newPass });
      // password_changed_at invalidates every token issued before this
      // instant, including the one just used to make this request — swap in
      // the fresh one the backend returns so the user isn't logged out by
      // their own password change (M12).
      useAuthStore.getState().setToken(data.access_token);
      toast.success(t('settings.password_changed'));
      setOldPass(''); setNewPass(''); setChangePassOpen(false);
    } catch (err) {
      const msg = apiErrorMessage(err, '');
      toast.error(t('settings.password_change_failed', { detail: msg ? ': ' + msg : '' }));
    }
  }

  async function handleChangeEmail(e) {
    e.preventDefault();
    const trimmed = newEmail.trim();
    if (!trimmed || !emailChangePassword) return toast.error(t('validation.fill_all_fields'));
    try {
      const updated = await updatePrefs({ email: trimmed, password: emailChangePassword });
      setUser(updated);
      toast.success(t('toast.email_updated'));
      setNewEmail('');
      setEmailChangePassword('');
      setChangeEmailOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('toast.email_failed')));
    }
  }

  async function handleDeleteAccount() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => { setDeleteConfirm(false); setDeletePassword(''); }, 15000);
      return;
    }
    if (!deletePassword) {
      toast.error(t('validation.fill_all_fields'));
      return;
    }
    try {
      // A JWT alone isn't enough proof of intent for an irreversible cascade
      // delete of every track/POI/list (M9) — backend now requires the
      // password too, same bar as change-password.
      await client.delete('/api/auth/account', { data: { password: deletePassword } });
      // Clear token from localStorage immediately so that any in-flight
      // polling requests returning 401 (user no longer exists) don't
      // trigger the interceptor's page-reload before logout() runs.
      try { localStorage.removeItem('gps_auth'); } catch (_) {}
      logout();
      toast.success(t('toast.account_deleted'));
    } catch (err) {
      console.error('[delete account]', err.response?.status, err.response?.data, err);
      toast.error(apiErrorMessage(err, err.message || t('settings.account_delete_failed')));
    }
  }

  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' };
  const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 'var(--space-4) 0 var(--space-2)' };
  const chipGroup = { display: 'flex', gap: 'var(--space-1)' };

  return (
    <div style={{ minWidth: 260 }} onClick={(e) => e.stopPropagation()}>
      <Panel style={{ padding: 0, overflow: 'hidden' }}>
        <button
          onClick={() => setActivePanel(open ? null : 'top')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Map size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', flex: 1, textAlign: 'left' }}>GPS Heatmap</span>
          {open ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
        </button>

        {open && (
          <div className="panel-animate-in-up" style={{ padding: '0 var(--space-4) var(--space-4)', borderTop: '1px solid var(--border)' }}>
            <div style={sectionLabel}>{t('settings.display')}</div>

            <div style={row}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.units')}</span>
              <div style={chipGroup}>
                <Chip active={unitSystem === 'metric'} onClick={() => handleUnitSystem('metric')}>{t('settings.metric')}</Chip>
                <Chip active={unitSystem === 'imperial'} onClick={() => handleUnitSystem('imperial')}>{t('settings.imperial')}</Chip>
              </div>
            </div>

            <div style={row}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.theme')}</span>
              <Button variant="secondary" size="sm" onClick={handleTheme}>
                {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
                {theme === 'light' ? t('settings.dark') : t('settings.light')}
              </Button>
            </div>

            <div style={row}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.language')}</span>
              <select
                value={language}
                onChange={(e) => handleLanguage(e.target.value)}
                style={{ width: 'auto', padding: 'var(--space-1) var(--space-2)', fontSize: 12 }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <div style={row}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.track_info')}</span>
              <div style={chipGroup}>
                <Chip
                  active={expandedTrackInfo === 'off'}
                  onClick={() => setExpandedTrackInfo('off')}
                  title="Hide track info"
                >
                  Off
                </Chip>
                <Chip
                  active={expandedTrackInfo === 'partial'}
                  onClick={() => setExpandedTrackInfo('partial')}
                  title="Show on selection"
                >
                  On Selection
                </Chip>
                <Chip
                  active={expandedTrackInfo === 'on'}
                  onClick={() => setExpandedTrackInfo('on')}
                  title="Always show"
                >
                  Always
                </Chip>
              </div>
            </div>

            <div style={row}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.start_end_markers')}</span>
              <div style={chipGroup}>
                <Chip active={showStartEndMarkers} onClick={() => handleStartEndMarkers(true)}>
                  {t('settings.on')}
                </Chip>
                <Chip active={!showStartEndMarkers} onClick={() => handleStartEndMarkers(false)}>
                  {t('settings.off')}
                </Chip>
              </div>
            </div>

            <div style={row}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.random_track_colors')}</span>
              <div style={chipGroup}>
                <Chip active={randomizeTrackColors} onClick={() => handleRandomizeTrackColors(true)}>
                  {t('settings.on')}
                </Chip>
                <Chip active={!randomizeTrackColors} onClick={() => handleRandomizeTrackColors(false)}>
                  {t('settings.off')}
                </Chip>
              </div>
            </div>

            <div style={row}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.notifications_enabled')}</span>
              <div style={chipGroup}>
                <Chip active={notificationsEnabled} onClick={() => handleNotificationsEnabled(true)}>
                  {t('settings.on')}
                </Chip>
                <Chip active={!notificationsEnabled} onClick={() => handleNotificationsEnabled(false)}>
                  {t('settings.off')}
                </Chip>
              </div>
            </div>

            <div style={row}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.notifications')}</span>
              <div style={chipGroup}>
                <Chip active={toastPosition === 'top-left'} onClick={() => setToastPosition('top-left')} title={t('settings.notif_top_left')}>
                  ↖
                </Chip>
                <Chip active={toastPosition === 'top-right'} onClick={() => setToastPosition('top-right')} title={t('settings.notif_top_right')}>
                  ↗
                </Chip>
                <Chip active={toastPosition === 'bottom-left'} onClick={() => setToastPosition('bottom-left')} title={t('settings.notif_bottom_left')}>
                  ↙
                </Chip>
                <Chip active={toastPosition === 'bottom-right'} onClick={() => setToastPosition('bottom-right')} title={t('settings.notif_bottom_right')}>
                  ↘
                </Chip>
              </div>
            </div>

            {isAuthenticated && (
              <>
                <div style={sectionLabel}>{t('poi.title')}</div>
                <Button
                  variant="secondary"
                  size="sm"
                  style={{ width: '100%', marginBottom: 'var(--space-2)' }}
                  onClick={() => setCategoriesModalOpen(true)}
                >
                  <Tags size={13} /> {t('poi.manage_categories')}
                </Button>

                <div style={sectionLabel}>{t('settings.account')}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <User size={13} /> {user?.email}
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ flex: 1, color: 'var(--accent)' }}
                    onClick={() => { setChangeEmailOpen(!changeEmailOpen); setChangePassOpen(false); }}
                  >
                    <Mail size={13} /> {t('settings.change_email')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ flex: 1, color: 'var(--accent)' }}
                    onClick={() => { setChangePassOpen(!changePassOpen); setChangeEmailOpen(false); }}
                  >
                    <Key size={13} /> {t('settings.change_password')}
                  </Button>
                </div>

                {changeEmailOpen && (
                  <form onSubmit={handleChangeEmail} style={{ marginBottom: 'var(--space-2)', animation: 'fadeIn 0.3s ease-out' }}>
                    <Input
                      type="email"
                      placeholder={t('toast.email_placeholder')}
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      style={{ marginBottom: 'var(--space-2)' }}
                      autoFocus
                    />
                    <Input
                      type="password"
                      placeholder={t('settings.current_password')}
                      value={emailChangePassword}
                      onChange={(e) => setEmailChangePassword(e.target.value)}
                      style={{ marginBottom: 'var(--space-2)' }}
                    />
                    <Button type="submit" style={{ width: '100%' }}>
                      {t('settings.update')}
                    </Button>
                  </form>
                )}

                {changePassOpen && (
                  <form onSubmit={handleChangePassword} style={{ marginBottom: 'var(--space-2)', animation: 'fadeIn 0.3s ease-out' }}>
                    <Input
                      type="password"
                      placeholder={t('settings.current_password')}
                      value={oldPass}
                      onChange={(e) => setOldPass(e.target.value)}
                      style={{ marginBottom: 'var(--space-1)' }}
                    />
                    <Input
                      type="password"
                      placeholder={t('settings.new_password')}
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      style={{ marginBottom: 'var(--space-2)' }}
                    />
                    <Button type="submit" style={{ width: '100%' }}>
                      {t('settings.update')}
                    </Button>
                  </form>
                )}

                {deleteConfirm && (
                  <Input
                    type="password"
                    placeholder={t('settings.current_password')}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    autoFocus
                    style={{ marginBottom: 'var(--space-2)' }}
                  />
                )}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                  <Button
                    variant="secondary"
                    style={{ width: 170, height: 32, border: 'none' }}
                    onClick={() => { logout(); toast.success(t('auth.logout_success')); }}
                  >
                    <LogOut size={13} style={{ flexShrink: 0 }} /> {t('settings.sign_out')}
                  </Button>
                  <Button
                    variant="danger"
                    style={{ width: 170, height: 32 }}
                    onClick={handleDeleteAccount}
                  >
                    <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                    {deleteConfirm ? t('settings.confirm') : t('settings.delete_account')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Panel>

      <CategoryManageModal open={categoriesModalOpen} onClose={() => setCategoriesModalOpen(false)} />
    </div>
  );
}
