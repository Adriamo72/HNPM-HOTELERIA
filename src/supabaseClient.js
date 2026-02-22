import { createClient } from '@supabase/supabase-js';

// Importante: En React (CRA), las variables DEBEN empezar con REACT_APP_
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);