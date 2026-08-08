import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Trash2, Mail, Key, Send, ChevronDown, ChevronUp, Plus, UserRoundPlus, UserRoundX } from 'lucide-react';
import { notify as toast } from '../../utils/notify.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import {
  getAdminSettings, updateAdminSettings,
  listInvites, createInvite, revokeInvite,
  listAdminUsers, setUserEmail, setUserPassword, setUserAdmin, sendUserResetEmail, deleteAdminUser,
} from '../../api/admin.js';
import Button from '../../ui/Button.jsx';
import Card from '../../ui/Card.jsx';
import Chip from '../../ui/Chip.jsx';
import Input from '../../ui/Input.jsx';

const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' };
const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 'var(--space-3) 0 var(--space-2)' };
const chipGroup = { display: 'flex', gap: 'var(--space-1)' };

function InviteRow({ invite, onRevoke }) {
  const url = `${window.location.origin}/?invite=${invite.token}`;
  const usesLabel = invite.max_uses == null ? `${invite.use_count} uses` : `${invite.use_count}/${invite.max_uses}`;

  function copyLink() {
    navigator.clipboard.writeText(url).then(
      () => toast.success('Invite link copied'),
      () => toast.error('Could not copy link'),
    );
  }

  const exhausted = invite.max_uses != null && invite.use_count >= invite.max_uses;
  const inactive = invite.revoked || exhausted;

  return (
    <div style={{ ...row, opacity: inactive ? 0.5 : 1 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {invite.token.slice(0, 16)}…
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {invite.revoked ? 'Revoked' : exhausted ? 'Used up' : (invite.max_uses === 1 ? 'Single-use' : 'Multi-use')} · {usesLabel}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
        {!inactive && (
          <Button variant="ghost" size="sm" iconOnly onClick={copyLink} title="Copy link">
            <Copy size={13} />
          </Button>
        )}
        {!invite.revoked && (
          <Button variant="ghost" size="sm" iconOnly onClick={() => onRevoke(invite.id)} title="Revoke">
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </div>
  );
}

function UserRow({ user, onChanged, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(user.email);
  const [newPassword, setNewPassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSetEmail(e) {
    e.preventDefault();
    const trimmed = newEmail.trim();
    if (!trimmed || trimmed === user.email) return;
    setBusy(true);
    try {
      const updated = await setUserEmail(user.id, trimmed);
      toast.success('Email updated');
      setEmailOpen(false);
      onChanged(updated);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update email'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters');
    setBusy(true);
    try {
      await setUserPassword(user.id, newPassword);
      toast.success('Password updated');
      setPassOpen(false);
      setNewPassword('');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update password'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReset() {
    setBusy(true);
    try {
      await sendUserResetEmail(user.id);
      toast.success('Reset email sent');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to send reset email'));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAdmin() {
    setBusy(true);
    try {
      const updated = await setUserAdmin(user.id, !user.is_admin);
      toast.success(updated.is_admin ? 'Made admin' : 'Removed admin');
      onChanged(updated);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update admin status'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 8000);
      return;
    }
    setBusy(true);
    try {
      await deleteAdminUser(user.id);
      toast.success('Account deleted');
      onDeleted(user.id);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to delete account'));
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginBottom: 8, padding: 'var(--space-2) var(--space-3)' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
      >
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.email}{user.is_admin && <span style={{ color: 'var(--accent)', fontWeight: 700 }}> · admin</span>}
        </span>
        {expanded ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
      </button>

      {expanded && (
        <div style={{ paddingTop: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)', marginBottom: (emailOpen || passOpen) ? 'var(--space-2)' : 0 }}>
            <Button
              iconOnly
              variant="ghost"
              onClick={handleToggleAdmin}
              disabled={busy}
              title={user.is_admin ? 'Remove admin' : 'Make admin'}
              style={user.is_admin ? { color: 'var(--accent)' } : undefined}
            >
              {user.is_admin ? <UserRoundX size={14} /> : <UserRoundPlus size={14} />}
            </Button>
            <Button iconOnly variant="ghost" active={emailOpen} onClick={() => { setEmailOpen(!emailOpen); setPassOpen(false); }} title="Change email">
              <Mail size={14} />
            </Button>
            <Button iconOnly variant="ghost" active={passOpen} onClick={() => { setPassOpen(!passOpen); setEmailOpen(false); }} title="Set password">
              <Key size={14} />
            </Button>
            <Button iconOnly variant="ghost" onClick={handleSendReset} disabled={busy} title="Send reset email">
              <Send size={14} />
            </Button>
            <Button iconOnly variant="ghost" onClick={handleDelete} disabled={busy} title={deleteConfirm ? 'Click again to confirm' : 'Delete account'} style={deleteConfirm ? { color: 'var(--danger)' } : undefined}>
              <Trash2 size={14} />
            </Button>
          </div>

          {emailOpen && (
            <form onSubmit={handleSetEmail} style={{ marginBottom: 'var(--space-2)' }}>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={{ marginBottom: 'var(--space-2)' }} autoFocus />
              <Button type="submit" size="sm" style={{ width: '100%' }} disabled={busy}>Save email</Button>
            </form>
          )}

          {passOpen && (
            <form onSubmit={handleSetPassword} style={{ marginBottom: 'var(--space-2)' }}>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" style={{ marginBottom: 'var(--space-2)' }} autoFocus />
              <Button type="submit" size="sm" style={{ width: '100%' }} disabled={busy}>Set password</Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

export default function AdminPanel() {
  const [settings, setSettings] = useState(null);
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    Promise.all([getAdminSettings(), listInvites(), listAdminUsers()])
      .then(([s, inv, u]) => {
        setSettings(s);
        setInvites(inv);
        setUsers(u);
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Failed to load admin data')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Search is server-side (User.email ilike) but debounced client-side —
  // same 300ms floor as LeftIsland's track search, no reason to fire on
  // every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      listAdminUsers(search).then(setUsers).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleToggleRegistration(next) {
    if (!settings || next === settings.registration_enabled) return;
    try {
      const updated = await updateAdminSettings({ registration_enabled: next });
      setSettings(updated);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update setting'));
    }
  }

  async function handleCreateInvite(maxUses) {
    try {
      const invite = await createInvite(maxUses);
      setInvites((prev) => [invite, ...prev]);
      navigator.clipboard.writeText(`${window.location.origin}/?invite=${invite.token}`).then(
        () => toast.success('Invite created — link copied to clipboard'),
        () => toast.success('Invite created'),
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create invite'));
    }
  }

  async function handleRevokeInvite(id) {
    try {
      await revokeInvite(id);
      setInvites((prev) => prev.map((i) => (i.id === id ? { ...i, revoked: true } : i)));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to revoke invite'));
    }
  }

  if (loading) {
    return <div style={{ padding: 'var(--space-4) 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Loading…</div>;
  }

  return (
    <div style={{ paddingTop: 4, paddingBottom: 4 }}>
      <div style={row}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)' }}>Open registration</span>
        <div style={chipGroup}>
          <Chip active={settings?.registration_enabled === true} onClick={() => handleToggleRegistration(true)}>On</Chip>
          <Chip active={settings?.registration_enabled === false} onClick={() => handleToggleRegistration(false)}>Off</Chip>
        </div>
      </div>
      {settings?.registration_enabled === false && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 'var(--space-2)', marginTop: -4 }}>
          New sign-ups need an invite link below.
        </div>
      )}

      <div style={sectionLabel}>Invite links</div>
      {invites.length === 0 && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>No invite links yet.</div>
      )}
      {invites.map((inv) => (
        <InviteRow key={inv.id} invite={inv} onRevoke={handleRevokeInvite} />
      ))}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
        <Button variant="secondary" size="sm" style={{ flex: 1 }} onClick={() => handleCreateInvite(1)}>
          <Plus size={13} /> Single-use link
        </Button>
        <Button variant="secondary" size="sm" style={{ flex: 1 }} onClick={() => handleCreateInvite(null)}>
          <Plus size={13} /> Multi-use link
        </Button>
      </div>

      <div style={sectionLabel}>Manage accounts</div>
      <Input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by email…"
        style={{ borderRadius: 'var(--radius-search)', marginBottom: 'var(--space-2)' }}
      />
      {users.length === 0 && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>No accounts found.</div>
      )}
      {users.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          onChanged={(updated) => setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
          onDeleted={(id) => setUsers((prev) => prev.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}
