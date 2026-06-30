import client from './client.js';

export async function register(email, password) {
  const { data } = await client.post('/api/auth/register', { email, password });
  return data;
}

export async function login(email, password) {
  const { data } = await client.post('/api/auth/login', { email, password });
  return data;
}

export async function forgotPassword(email) {
  const { data } = await client.post('/api/auth/forgot-password', { email });
  return data;
}

export async function resetPassword(token, password) {
  const { data } = await client.post('/api/auth/reset-password', { token, password });
  return data;
}
