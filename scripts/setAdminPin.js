// scripts/setAdminPin.js
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Buscar el archivo .env en diferentes ubicaciones
let envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    envPath = path.join(__dirname, '..', '..', '.env');
}
if (!fs.existsSync(envPath)) {
    envPath = path.join(process.cwd(), '.env');
}

// Cargar variables de entorno
try {
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value && !key.startsWith('#')) {
                process.env[key.trim()] = value.trim();
            }
        });
        console.log('✓ Archivo .env cargado desde:', envPath);
    } else {
        console.log('⚠ No se encontró archivo .env, usando variables de entorno del sistema');
    }
} catch (err) {
    console.log('⚠ Error cargando .env:', err.message);
}

// Configuración de Supabase
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

console.log('\n🔍 Buscando variables de entorno...');
console.log('   REACT_APP_SUPABASE_URL:', supabaseUrl ? '✓ Encontrada' : '✗ No encontrada');
console.log('   REACT_APP_SUPABASE_ANON_KEY:', supabaseKey ? '✓ Encontrada' : '✗ No encontrada');

if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ ERROR: Faltan variables de entorno');
    console.error('\n📌 Crea un archivo .env en la raíz del proyecto con:');
    console.error('REACT_APP_SUPABASE_URL=https://tuproyecto.supabase.co');
    console.error('REACT_APP_SUPABASE_ANON_KEY=tu-anon-key-aqui');
    console.error('\n📌 También puedes ejecutar:');
    console.error('   set REACT_APP_SUPABASE_URL=tu_url');
    console.error('   set REACT_APP_SUPABASE_ANON_KEY=tu_key');
    console.error('   node scripts/setAdminPin.js admin 1234');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Tomar usuario y PIN de los argumentos o usar valores por defecto
const usuario = process.argv[2] || 'admin';
const pin = process.argv[3] || '1234';

async function setAdminPin() {
    console.log('\n🔐 Configurando administrador...');
    console.log(`   Usuario: ${usuario}`);
    console.log(`   PIN: ${pin}`);
    console.log('');
    
    try {
        // Generar hash del PIN
        const salt = bcrypt.genSaltSync(10);
        const pinHash = bcrypt.hashSync(pin, salt);
        
        console.log('📝 Hash generado:', pinHash);
        
        // Verificar si la tabla admin_acceso existe
        const { data: testData, error: testError } = await supabase
            .from('admin_acceso')
            .select('id')
            .limit(1);
        
        if (testError && testError.code === '42P01') {
            console.error('\n❌ La tabla "admin_acceso" no existe en Supabase.');
            console.log('\n📌 Ejecuta este SQL en el editor SQL de Supabase:');
            console.log(`
CREATE TABLE IF NOT EXISTS public.admin_acceso (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario VARCHAR(50) NOT NULL UNIQUE,
  pin_hash VARCHAR(255) NOT NULL,
  activo BOOLEAN DEFAULT true,
  intentos_fallidos INTEGER DEFAULT 0,
  bloqueado_hasta TIMESTAMP,
  ultimo_acceso TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_acceso_usuario ON public.admin_acceso(usuario);
`);
            process.exit(1);
        }
        
        // Verificar si ya existe
        const { data: existing, error: queryError } = await supabase
            .from('admin_acceso')
            .select('id, usuario')
            .eq('usuario', usuario.toLowerCase().trim())
            .maybeSingle();
        
        if (queryError && queryError.code !== 'PGRST116') {
            console.error('❌ Error al consultar:', queryError);
            process.exit(1);
        }
        
        let result;
        
        if (existing) {
            console.log(`📝 Actualizando admin existente: ${existing.usuario}`);
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
            console.log('📝 Creando nuevo admin...');
            result = await supabase
                .from('admin_acceso')
                .insert({ 
                    usuario: usuario.toLowerCase().trim(), 
                    pin_hash: pinHash,
                    activo: true,
                    created_at: new Date().toISOString()
                });
        }
        
        if (result.error) {
            console.error('❌ Error al guardar:', result.error);
            process.exit(1);
        }
        
        console.log('\n✅ Administrador configurado correctamente');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📱 Credenciales de acceso:');
        console.log(`   Usuario: ${usuario}`);
        console.log(`   PIN: ${pin}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️  Guarda estas credenciales en un lugar seguro');
        console.log('🔐 Puedes cambiar el PIN desde el panel de administración');
        
    } catch (error) {
        console.error('❌ Error inesperado:', error);
        process.exit(1);
    }
}

setAdminPin();