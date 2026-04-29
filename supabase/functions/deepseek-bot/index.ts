import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejar OPTIONS (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders 
    })
  }

  try {
    // Leer el body correctamente
    const body = await req.json()
    console.log('Body recibido:', body)
    
    // Obtener el mensaje de diferentes formas posibles
    let mensaje = body.mensaje || body.message || body.text || ''
    
    if (!mensaje) {
      return new Response(
        JSON.stringify({ 
          respuesta: 'No recibí ningún mensaje. Por favor, haz una pregunta.',
          ok: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('Mensaje procesado:', mensaje)
    
    // Determinar la fecha a consultar
    let fecha = new Date()
    const textoLower = mensaje.toLowerCase()
    
    if (textoLower.includes('ayer')) {
      fecha.setDate(fecha.getDate() - 1)
    } else if (textoLower.includes('anteayer')) {
      fecha.setDate(fecha.getDate() - 2)
    }
    
    const fechaStr = fecha.toISOString().split('T')[0]
    
    // Crear cliente de Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    
    // Consultar ocupación para esa fecha
    const { data: ocupaciones, error } = await supabase
      .from('ocupacion_habitaciones')
      .select('camas_ocupadas, total_camas, tipo_habitacion')
      .gte('fecha', `${fechaStr} 00:00:00`)
      .lte('fecha', `${fechaStr} 23:59:59`)
    
    if (error) {
      console.error('Error DB:', error)
      return new Response(
        JSON.stringify({ 
          respuesta: `Error consultando la base de datos: ${error.message}`,
          ok: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Calcular total de pacientes
    let totalPacientes = 0
    let totalCamas = 0
    
    for (const occ of ocupaciones || []) {
      if (occ.tipo_habitacion === 'activa') {
        totalPacientes += occ.camas_ocupadas || 0
        totalCamas += occ.total_camas || 0
      }
    }
    
    // Respuesta simple (por ahora sin DeepSeek para probar)
    const respuesta = `El ${fechaStr} había ${totalPacientes} pacientes internados en el hospital (de ${totalCamas} camas totales).`
    
    return new Response(
      JSON.stringify({ 
        respuesta: respuesta,
        fecha: fechaStr,
        pacientes: totalPacientes,
        ok: true 
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
    
  } catch (error) {
    console.error('Error:', error.message)
    return new Response(
      JSON.stringify({ 
        error: error.message, 
        ok: false 
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})