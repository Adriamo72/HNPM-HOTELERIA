// scripts/setAdminPin.js
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables de entorno');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const usuario = process.argv[2] || 'admin';
const pin = process.argv[3] || '1234';

async function setAdminPin() {
  console.log('🔐 Configurando administrador...');
  
  const salt = bcrypt.genSaltSync(10);
  const pinHash = bcrypt.hashSync(pin, salt);
  
  // Verificar si ya existe
  const { data: existing } = await supabase
    .from('admin_acceso')
    .select('id')
    .eq('usuario', usuario)
    .single();
  
  let result;
  
  if (existing) {
    result = await supabase
      .from('admin_acceso')
      .update({ 
        pin_hash: pinHash,
        activo: true,
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
  } else {
    result = await supabase
      .from('admin_acceso')
      .insert({ 
        usuario: usuario, 
        pin_hash: pinHash,
        activo: true,
        created_at: new Date().toISOString()
      });
  }
  
  if (result.error) {
    console.error('❌ Error:', result.error);
  } else {
    console.log('✅ Administrador configurado');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Usuario:', usuario);
    console.log('PIN:', pin);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}

setAdminPin();