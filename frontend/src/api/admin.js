import client from './client.js';

// ── Registration toggle ──────────────────────────────────────────────────────

export async function getAdminSettings() {
  const { data } = await client.get('/api/admin/settings');
  return data;
}

export async function updateAdminSettings(patch) {
  const { data } = await client.patch('/api/admin/settings', patch);
  return data;
}

// ── Invite links ──────────────────────────────────────────────────────────────

export async function listInvites() {
  const { data } = await client.get('/api/admin/invites');
  return data;
}

export async function createInvite(maxUses) {
  const { data } = await client.post('/api/admin/invites', { max_uses: maxUses });
  return data;
}

export async function revokeInvite(id) {
  await client.delete(`/api/admin/invites/${id}`);
}

// ── User management ──────────────────────────────────────────────────────────

export async function listAdminUsers(search) {
  const { data } = await client.get('/api/admin/users', { params: search ? { search } : {} });
  return data;
}

export async function setUserEmail(userId, email) {
  const { data } = await client.patch(`/api/admin/users/${userId}/email`, { email });
  return data;
}

export async function setUserAdmin(userId, isAdmin) {
  const { data } = await client.patch(`/api/admin/users/${userId}/admin`, { is_admin: isAdmin });
  return data;
}

export async function setUserPassword(userId, newPassword) {
  await client.post(`/api/admin/users/${userId}/password`, { new_password: newPassword });
}

export async function sendUserResetEmail(userId) {
  await client.post(`/api/admin/users/${userId}/send-reset-email`);
}

export async function deleteAdminUser(userId) {
  await client.delete(`/api/admin/users/${userId}`);
}
