import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const { mensaje } = await req.json()
    const textoLower = mensaje.toLowerCase()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    
    // ============================================
    // OBTENER EL ESTADO MÁS RECIENTE DE CADA HABITACIÓN
    // ============================================
    const { data: ultimaOcupacion, error } = await supabase
      .from('ocupacion_habitaciones')
      .select(`
        *,
        habitaciones_especiales!inner (
          id,
          nombre,
          piso_id,
          pisos!inner (nombre_piso)
        )
      `)
      .order('habitacion_id')
      .order('actualizado_en', { ascending: false })
    
    if (error) {
      return new Response(
        JSON.stringify({ respuesta: `Error: ${error.message}`, ok: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // DEDUPLICAR: quedarse con el primer registro de cada habitación (el más reciente)
    const mapaUltimoEstado = new Map()
    for (const registro of ultimaOcupacion || []) {
      if (!mapaUltimoEstado.has(registro.habitacion_id)) {
        mapaUltimoEstado.set(registro.habitacion_id, registro)
      }
    }
    
    const ocupacionesRecientes = Array.from(mapaUltimoEstado.values())
    
    // ============================================
    // DETECTAR PISO
    // ============================================
    let pisoObjetivo: number | null = null
    if (textoLower.includes('piso 6') || textoLower.includes('sexto piso')) pisoObjetivo = 6
    if (textoLower.includes('piso 5') || textoLower.includes('quinto piso')) pisoObjetivo = 5
    if (textoLower.includes('piso 4') || textoLower.includes('cuarto piso')) pisoObjetivo = 4
    if (textoLower.includes('piso 3') || textoLower.includes('tercer piso')) pisoObjetivo = 3
    if (textoLower.includes('piso 2') || textoLower.includes('segundo piso')) pisoObjetivo = 2
    if (textoLower.includes('piso 1') || textoLower.includes('primer piso')) pisoObjetivo = 1
    
    // ============================================
    // HABITACIONES EN REPARACIÓN
    // ============================================
    if (textoLower.includes('reparacion') || textoLower.includes('reparación')) {
      const reparaciones = ocupacionesRecientes.filter(occ => 
        occ.tipo_habitacion === 'reparacion' &&
        (pisoObjetivo === null || occ.habitaciones_especiales?.pisos?.nombre_piso === `PISO ${pisoObjetivo}`)
      ).map(occ => occ.habitaciones_especiales?.nombre)
      
      const lista = reparaciones.filter(Boolean).join(', ')
      
      if (reparaciones.length === 0) {
        const respuesta = pisoObjetivo 
          ? `No hay habitaciones en reparación en el PISO ${pisoObjetivo}.`
          : `No hay habitaciones en reparación en el hospital.`
        return new Response(
          JSON.stringify({ respuesta, ok: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const respuesta = pisoObjetivo
        ? `Habitaciones en reparación en el PISO ${pisoObjetivo}: ${lista}.`
        : `Habitaciones en reparación en el hospital: ${lista}.`
      
      return new Response(
        JSON.stringify({ respuesta, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // RESPUESTA POR DEFECTO (CAMAS DISPONIBLES)
    // ============================================
    let totalCamas = 0
    let totalPacientes = 0
    let camasBloqueadas = 0
    
    for (const occ of ocupacionesRecientes) {
      if (pisoObjetivo !== null && occ.habitaciones_especiales?.pisos?.nombre_piso !== `PISO ${pisoObjetivo}`) continue
      if (occ.tipo_habitacion !== 'activa') continue
      
      totalCamas += occ.total_camas || 0
      totalPacientes += occ.camas_ocupadas || 0
      if (occ.aislamiento_activo && (occ.camas_ocupadas || 0) > 0) {
        camasBloqueadas += (occ.total_camas || 0) - (occ.camas_ocupadas || 0)
      }
    }
    
    const camasDisponibles = totalCamas - totalPacientes - camasBloqueadas
    const porcentaje = totalCamas > 0 ? Math.round((totalPacientes / totalCamas) * 100) : 0
    
    let respuesta = pisoObjetivo
      ? `En el PISO ${pisoObjetivo} hay ${camasDisponibles} camas disponibles. Total camas: ${totalCamas}. Ocupación: ${porcentaje}%.`
      : `Hay ${camasDisponibles} camas disponibles. Total camas: ${totalCamas}. Ocupación: ${porcentaje}%. ${camasBloqueadas} camas bloqueadas por aislamiento.`
    
    return new Response(
      JSON.stringify({ respuesta, ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message, ok: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})