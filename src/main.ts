import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export type SaveData = {
  score?: number;
  health?: number;
  stage?: string;
};

export async function saveProgress(data: SaveData, keyName = 'slot-1') {
  const payload = {
    key: keyName,
    data,
    updated_at: new Date().toISOString(),
  };

  if (!supabase) {
    localStorage.setItem(`pixel-buster-save:${keyName}`, JSON.stringify(data));
    return { local: true, data: payload };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    localStorage.setItem(`pixel-buster-save:${keyName}`, JSON.stringify(data));
    return { local: true, data: payload };
  }

  const { data: saved, error } = await supabase
    .from('saves')
    .upsert({
      user_id: user.id,
      key: keyName,
      data,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return { local: false, data: saved };
}

export async function loadProgress(keyName = 'slot-1') {
  if (!supabase) {
    const raw = localStorage.getItem(`pixel-buster-save:${keyName}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as SaveData;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    const raw = localStorage.getItem(`pixel-buster-save:${keyName}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as SaveData;
  }

  const { data, error } = await supabase
    .from('saves')
    .select('data')
    .eq('user_id', user.id)
    .eq('key', keyName)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return (data?.data ?? null) as SaveData | null;
}
