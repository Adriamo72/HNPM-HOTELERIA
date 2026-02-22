import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Log de diagnóstico (solo para ver en consola qué llega)
if (!supabaseUrl) {
  console.error("DEBUG: REACT_APP_SUPABASE_URL está vacía.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);