const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkHabitacion402() {
  try {
    // Buscar habitación 402
    const { data: habitacion, error: habError } = await supabase
      .from('habitaciones_especiales')
      .select('*')
      .eq('nombre', '402')
      .single();
    
    console.log('=== HABITACIÓN 402 ===');
    if (habError) {
      console.log('Error buscando habitación:', habError);
    } else if (habitacion) {
      console.log('Habitación encontrada:', habitacion);
      
      // Buscar ocupación de la habitación 402
      const { data: ocupacion, error: ocuError } = await supabase
        .from('ocupacion_habitaciones')
        .select('*')
        .eq('habitacion_id', habitacion.id)
        .order('fecha', { ascending: false })
        .limit(1);
      
      console.log('\n=== OCUPACIÓN ===');
      if (ocuError) {
        console.log('Error buscando ocupación:', ocuError);
      } else {
        console.log('Datos de ocupación:', ocupacion);
      }
    } else {
      console.log('Habitación 402 NO encontrada');
    }
    
    // Listar todas las habitaciones que empiezan con 4
    const { data: habitaciones4xx, error: error4xx } = await supabase
      .from('habitaciones_especiales')
      .select('id, nombre, piso_id')
      .like('nombre', '4%')
      .order('nombre');
    
    console.log('\n=== HABITACIONES 4XX ===');
    if (error4xx) {
      console.log('Error:', error4xx);
    } else {
      console.log('Habitaciones 4xx:', habitaciones4xx);
    }
    
  } catch (error) {
    console.error('Error general:', error);
  }
}

checkHabitacion402();
