import client from './client.js';

export async function fetchDirections(coordinates, profile) {
  const { data } = await client.post('/api/routing/directions', { profile, coordinates });
  return data;
}
