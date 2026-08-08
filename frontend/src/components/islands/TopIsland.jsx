import React, { useState, useRef } from 'react';
import {
  ChevronDown, ChevronUp, Sun, Moon, Settings, SlidersHorizontal, BarChart3,
  LogOut, User, Key, AlertTriangle, Map, Mail, Tags, BadgeCheck,
} from 'lucide-react';
import { notify as toast } from '../../utils/notify.js';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store/appStore.js';
import useAuthStore from '../../store/authStore.js';
import useMapStore from '../../store/mapStore.js';
import client from '../../api/client.js';
import { updatePrefs, forgotPassword } from '../../api/auth.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import Panel from '../../ui/Panel.jsx';
import Button from '../../ui/Button.jsx';
import Chip from '../../ui/Chip.jsx';
import Input from '../../ui/Input.jsx';
import CategoryManageModal from '../modals/CategoryManageModal.jsx';
import AdminPanel from './AdminPanel.jsx';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
];

export default function TopIsland() {
  const { theme, unitSystem, language, expandedTrackInfo, setTheme, setUnitSystem, setLanguage, setExpandedTrackInfo, activePanel, setActivePanel, tracks } = useAppStore();
  const { showStartEndMarkers, toggleStartEndMarkers } = useMapStore();
  const { isAuthenticated, user, logout, setUser } = useAuthStore();
  const notificationsEnabled = user?.notifications_enabled !== false;
  const randomizeTrackColors = user?.randomize_track_colors === true;
  const { t, i18n } = useTranslation();
  // Two independent panels share the app's single activePanel slot (only
  // one panel open anywhere at a time, same as every other island) — 'top'
  // is the original quick-access panel (Units/Theme/Language/Sign out
  // only, see below), 'top:gear' is the new Settings gear's 3-tab panel
  // (UI/Account/Administration). Opening one closes the other for free.
  const open = activePanel === 'top';
  const gearOpen = activePanel === 'top:gear';
  const [gearTab, setGearTab] = useState('ui');
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
  const [resettingPassword, setResettingPassword] = useState(false);

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

  async function handleResetPassword() {
    if (!user?.email || resettingPassword) return;
    setResettingPassword(true);
    try {
      await forgotPassword(user.email);
      toast.success(t('settings.reset_password_sent'));
    } catch (err) {
      toast.error(apiErrorMessage(err, t('settings.save_failed')));
    } finally {
      setResettingPassword(false);
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

  function handleSignOut() {
    logout();
    toast.success(t('auth.logout_success'));
  }

  // Client-side aggregation over appStore.tracks (already loaded in full —
  // App.jsx fetches up to TRACKS_FETCH_LIMIT=500 tracks for the heatmap, so
  // this is complete for the overwhelming majority of accounts, same
  // ceiling every other "all tracks" figure in the app already lives with).
  // No new backend endpoint for this — just a read of data already on the
  // client.
  const totalDistanceKm = tracks.reduce((sum, tr) => sum + (tr.distance_km || 0), 0);
  const totalHours = tracks.reduce((sum, tr) => sum + (tr.duration_sec || 0), 0) / 3600;
  const KM_TO_MI = 0.621371;

  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' };
  const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 'var(--space-4) 0 var(--space-2)' };
  const chipGroup = { display: 'flex', gap: 'var(--space-1)' };
  const headerButtonStyle = { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 };

  return (
    <div style={{ width: 315 }} onClick={(e) => e.stopPropagation()}>
      <Panel style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)' }}>
          <button
            onClick={() => setActivePanel(open ? null : 'top')}
            style={{ ...headerButtonStyle, gap: 'var(--space-3)', flex: 1 }}
          >
            <Map size={18} color="var(--accent)" />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', textAlign: 'left' }}>
              {gearOpen ? t('settings.title') : 'GPS Heatmap'}
            </span>
          </button>

          {/* Admin badge — purely informational (not a button, nothing to
              click), just flags that this account has the Administration
              Panel tab available. Only rendered for admins, always visible
              regardless of which panel is open. */}
          {isAuthenticated && user?.is_admin && (
            <BadgeCheck size={16} color="var(--accent)" title={t('settings.tab_admin')} />
          )}

          {/* Settings gear — opens the new UI/Account/Administration panel,
              a separate thing from the quick-access panel the title/chevron
              toggle below. Both share activePanel, so opening one closes
              the other. Clicking it again while already open jumps back to
              the quick-access panel instead of closing everything — same
              as the little X inside the gear panel below. */}
          <button
            onClick={() => setActivePanel(gearOpen ? 'top' : 'top:gear')}
            title={t('settings.tab_ui')}
            style={{ ...headerButtonStyle, color: gearOpen ? 'var(--accent)' : 'var(--text-secondary)' }}
          >
            <Settings size={16} />
          </button>

          {/* Chevron reflects whichever panel is actually open (quick-access
              OR gear) — it used to only track `open`, so it silently pointed
              down while the gear panel was visibly open (2026-08-08 bug
              report). Click collapses whatever's open, or opens the
              quick-access panel by default when both are closed. */}
          <button
            onClick={() => setActivePanel((open || gearOpen) ? null : 'top')}
            style={headerButtonStyle}
          >
            {(open || gearOpen) ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
          </button>
        </div>

        {/* Quick-access panel — trimmed down to the handful of settings
            worth one click (see 2026-08-08 TopIsland rework): everything
            else (track info, start/end markers, random colors,
            notifications, POI categories, the whole account/security
            block) moved into the gear panel below. Sign out stays here too
            (in addition to the gear's Account tab) since it's the single
            most common action in this menu. */}
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

            <div style={{ ...row, marginBottom: isAuthenticated ? 'var(--space-4)' : 0 }}>
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

            {isAuthenticated && (
              <Button
                variant="secondary"
                style={{ width: '100%', height: 32, border: 'none' }}
                onClick={handleSignOut}
              >
                <LogOut size={13} style={{ flexShrink: 0 }} /> {t('settings.sign_out')}
              </Button>
            )}
          </div>
        )}

        {/* Settings gear panel — UI / Account / Administration, each its own
            accordion section (one open at a time, like the island itself)
            instead of a flat tab switcher. */}
        {gearOpen && (
          <div className="panel-animate-in-up" style={{ padding: '0 var(--space-4) var(--space-4)', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setGearTab(gearTab === 'ui' ? null : 'ui')}
              style={{ ...headerButtonStyle, width: '100%', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}
            >
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                <SlidersHorizontal size={13} /> {t('settings.tab_ui')}
              </span>
              {gearTab === 'ui' ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
            </button>

            {gearTab === 'ui' && (
              <div style={{ paddingBottom: 'var(--space-2)' }}>
                {/* Duplicated from the quick-access panel above (Units/
                    Theme/Language/Sign out) — same settings, same handlers,
                    just also reachable from here so this tab is a complete
                    settings surface on its own. */}
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
                    <Chip active={expandedTrackInfo === 'off'} onClick={() => setExpandedTrackInfo('off')} title="Hide track info">Off</Chip>
                    <Chip active={expandedTrackInfo === 'partial'} onClick={() => setExpandedTrackInfo('partial')} title="Show on selection">On Selection</Chip>
                    <Chip active={expandedTrackInfo === 'on'} onClick={() => setExpandedTrackInfo('on')} title="Always show">Always</Chip>
                  </div>
                </div>

                <div style={row}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.start_end_markers')}</span>
                  <div style={chipGroup}>
                    <Chip active={showStartEndMarkers} onClick={() => handleStartEndMarkers(true)}>{t('settings.on')}</Chip>
                    <Chip active={!showStartEndMarkers} onClick={() => handleStartEndMarkers(false)}>{t('settings.off')}</Chip>
                  </div>
                </div>

                <div style={row}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.random_track_colors')}</span>
                  <div style={chipGroup}>
                    <Chip active={randomizeTrackColors} onClick={() => handleRandomizeTrackColors(true)}>{t('settings.on')}</Chip>
                    <Chip active={!randomizeTrackColors} onClick={() => handleRandomizeTrackColors(false)}>{t('settings.off')}</Chip>
                  </div>
                </div>

                <div style={row}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.notifications_enabled')}</span>
                  <div style={chipGroup}>
                    <Chip active={notificationsEnabled} onClick={() => handleNotificationsEnabled(true)}>{t('settings.on')}</Chip>
                    <Chip active={!notificationsEnabled} onClick={() => handleNotificationsEnabled(false)}>{t('settings.off')}</Chip>
                  </div>
                </div>

                {isAuthenticated && (
                  <Button
                    variant="secondary"
                    size="sm"
                    style={{ width: '100%', marginTop: 'var(--space-1)' }}
                    onClick={() => setCategoriesModalOpen(true)}
                  >
                    <Tags size={13} /> {t('poi.manage_categories')}
                  </Button>
                )}
              </div>
            )}

            {isAuthenticated && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => setGearTab(gearTab === 'account' ? null : 'account')}
                  style={{ ...headerButtonStyle, width: '100%', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}
                >
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <User size={13} /> {t('settings.tab_account')}
                  </span>
                  {gearTab === 'account' ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
                </button>
              </div>
            )}

            {gearTab === 'account' && isAuthenticated && (
              <div style={{ paddingBottom: 'var(--space-2)' }}>
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

                <Button
                  variant="ghost"
                  size="sm"
                  style={{ width: '100%', color: 'var(--accent)', marginBottom: 'var(--space-2)' }}
                  onClick={handleResetPassword}
                  disabled={resettingPassword}
                >
                  <Key size={13} /> {t('settings.reset_password')}
                </Button>

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
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                  <Button
                    variant="secondary"
                    style={{ flex: 1, height: 32, border: 'none' }}
                    onClick={handleSignOut}
                  >
                    <LogOut size={13} style={{ flexShrink: 0 }} /> {t('settings.sign_out')}
                  </Button>
                  <Button
                    variant="danger"
                    style={{ flex: 1, height: 32 }}
                    onClick={handleDeleteAccount}
                  >
                    <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                    {deleteConfirm ? t('settings.confirm') : t('settings.delete_account')}
                  </Button>
                </div>
              </div>
            )}

            {isAuthenticated && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => setGearTab(gearTab === 'stats' ? null : 'stats')}
                  style={{ ...headerButtonStyle, width: '100%', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}
                >
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <BarChart3 size={13} /> {t('settings.tab_stats')}
                  </span>
                  {gearTab === 'stats' ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
                </button>
              </div>
            )}

            {gearTab === 'stats' && isAuthenticated && (
              <div style={{ paddingBottom: 'var(--space-2)' }}>
                <div style={row}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.stat_joined')}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString(i18n.language) : '—'}
                  </span>
                </div>
                <div style={row}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.stat_distance')}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                    {unitSystem === 'imperial'
                      ? `${(totalDistanceKm * KM_TO_MI).toFixed(1)} mi`
                      : `${totalDistanceKm.toFixed(1)} km`}
                  </span>
                </div>
                <div style={row}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.stat_hours')}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{totalHours.toFixed(1)}</span>
                </div>
                <div style={{ ...row, marginBottom: 0 }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{t('settings.stat_tracks')}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{tracks.length}</span>
                </div>
              </div>
            )}

            {isAuthenticated && user?.is_admin && (
              // marginBottom: -18 cancels out the gear panel wrapper's own
              // paddingBottom (var(--space-4), 16px) plus this section's
              // trailing space (12px collapsed / 12px expanded — button's
              // own bottom padding, or AdminPanel's last card margin +
              // its own bottom padding) down to a net 10px at the very
              // bottom of the island, instead of the ~28px every other
              // "last tab" gets from the wrapper alone. Scoped to this one
              // section (not the shared wrapper) so UI/Account/Stats keep
              // their existing bottom spacing.
              <div style={{ borderTop: '1px solid var(--border)', marginBottom: -9, overflow: 'hidden' }}>
                <button
                  onClick={() => setGearTab(gearTab === 'admin' ? null : 'admin')}
                  style={{ ...headerButtonStyle, width: '100%', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}
                >
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <BadgeCheck size={13} /> {t('settings.tab_admin')}
                  </span>
                  {gearTab === 'admin' ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
                </button>
                {gearTab === 'admin' && <AdminPanel />}
              </div>
            )}
          </div>
        )}
      </Panel>

      <CategoryManageModal open={categoriesModalOpen} onClose={() => setCategoriesModalOpen(false)} />
    </div>
  );
}
