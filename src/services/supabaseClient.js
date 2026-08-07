// Supabase Integration Service for +58express
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function fetchSupabaseTable(table) {
  if (!isSupabaseConfigured) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn(`Supabase fetch [${table}] info:`, err);
  }
  return null;
}

export async function syncInsertSupabase(table, record) {
  if (!isSupabaseConfigured) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(record)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn(`Supabase insert [${table}] info:`, err);
  }
  return null;
}

export async function syncUpdateSupabase(table, id, updates) {
  if (!isSupabaseConfigured) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn(`Supabase update [${table}] info:`, err);
  }
  return null;
}

export async function fetchSupabaseTrips() {
  return fetchSupabaseTable('trips');
}

export async function createSupabaseTrip(tripData) {
  return syncInsertSupabase('trips', tripData);
}
