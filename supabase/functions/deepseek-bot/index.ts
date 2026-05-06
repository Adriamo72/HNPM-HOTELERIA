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
    // DETECTAR INTENCIÓN REAL
    // ============================================
    let modo = 'total' // total | solo_piso | excluir_piso | excluir_servicio
    let pisoObjetivo: number | null = null
    let servicioObjetivo: string | null = null
    
    // Detectar pisos
    let pisoEncontrado: number | null = null
    if (textoLower.includes('piso 2') || textoLower.includes('segundo piso')) pisoEncontrado = 2
    if (textoLower.includes('piso 3') || textoLower.includes('tercer piso')) pisoEncontrado = 3
    if (textoLower.includes('piso 4') || textoLower.includes('cuarto piso')) pisoEncontrado = 4
    if (textoLower.includes('piso 5') || textoLower.includes('quinto piso')) pisoEncontrado = 5
    if (textoLower.includes('piso 6') || textoLower.includes('sexto piso')) pisoEncontrado = 6
    
    // Detectar servicios
    let servicioEncontrado: string | null = null
    if (textoLower.includes('uco')) servicioEncontrado = 'UCO'
    if (textoLower.includes('uti')) servicioEncontrado = 'UTI'
    
    // DETERMINAR MODO según las palabras clave
    const esExclusion = textoLower.includes('exceptuando') || 
                        textoLower.includes('excluyendo') || 
                        textoLower.includes('sin contar') ||
                        textoLower.includes('menos')
    
    const esSoloPiso = (textoLower.includes('en el piso') || textoLower.includes('del piso')) && !esExclusion
    
    if (esSoloPiso && pisoEncontrado) {
      modo = 'solo_piso'
      pisoObjetivo = pisoEncontrado
    } else if (esExclusion && pisoEncontrado) {
      modo = 'excluir_piso'
      pisoObjetivo = pisoEncontrado
    } else if (esExclusion && servicioEncontrado) {
      modo = 'excluir_servicio'
      servicioObjetivo = servicioEncontrado
    } else if (pisoEncontrado && !esExclusion) {
      modo = 'solo_piso'
      pisoObjetivo = pisoEncontrado
    }
    
    console.log(`Modo: ${modo}, Piso: ${pisoObjetivo}, Servicio: ${servicioObjetivo}`)
    
    // ============================================
    // OBTENER DATOS DE LA BASE DE DATOS
    // ============================================
    const hoy = new Date().toISOString().split('T')[0]
    
    const { data: habitacionesConOcupacion, error } = await supabase
      .from('habitaciones_especiales')
      .select(`
        id,
        nombre,
        piso_id,
        pisos (nombre_piso),
        ocupacion_habitaciones (
          fecha,
          tipo_habitacion,
          total_camas,
          camas_ocupadas,
          observaciones,
          aislamiento_activo,
          actualizado_en
        )
      `)
    
    if (error) {
      return new Response(
        JSON.stringify({ respuesta: `Error: ${error.message}`, ok: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // FILTRAR SEGÚN MODO
    // ============================================
    let totalCamas = 0
    let totalPacientes = 0
    let camasBloqueadas = 0
    
    for (const hab of habitacionesConOcupacion || []) {
      const ocupaciones = hab.ocupacion_habitaciones || []
      const ocupacionActual = ocupaciones
        .filter((o: any) => o.fecha === hoy)
        .sort((a: any, b: any) => new Date(b.actualizado_en).getTime() - new Date(a.actualizado_en).getTime())[0]
      
      if (!ocupacionActual || ocupacionActual.tipo_habitacion !== 'activa') continue
      
      const pisoNombre = hab.pisos?.nombre_piso || ''
      const pisoNumero = parseInt(pisoNombre.replace(/\D/g, '')) || 0
      const servicio = (ocupacionActual.observaciones || '').toUpperCase()
      
      // Aplicar filtro según modo
      if (modo === 'solo_piso' && pisoObjetivo !== null && pisoNumero !== pisoObjetivo) continue
      if (modo === 'excluir_piso' && pisoObjetivo !== null && pisoNumero === pisoObjetivo) continue
      if (modo === 'excluir_servicio' && servicioObjetivo !== null && servicio.includes(servicioObjetivo)) continue
      
      const camas = ocupacionActual.total_camas || 0
      const ocupadas = ocupacionActual.camas_ocupadas || 0
      const aislamiento = ocupacionActual.aislamiento_activo === true
      
      totalCamas += camas
      totalPacientes += ocupadas
      
      if (aislamiento && ocupadas > 0) {
        camasBloqueadas += (camas - ocupadas)
      }
    }
    
    const camasDisponibles = totalCamas - totalPacientes - camasBloqueadas
    const porcentajeOcupacion = totalCamas > 0 ? Math.round((totalPacientes / totalCamas) * 100) : 0
    
    // ============================================
    // CONSTRUIR RESPUESTA
    // ============================================
    let respuestaTexto = ''
    
    if (modo === 'solo_piso' && pisoObjetivo) {
      respuestaTexto = `En el PISO ${pisoObjetivo} hay ${camasDisponibles} camas disponibles. Total camas en el piso: ${totalCamas}. Ocupación: ${porcentajeOcupacion}%.`
    } else if (modo === 'excluir_piso' && pisoObjetivo) {
      respuestaTexto = `Excluyendo el PISO ${pisoObjetivo}, hay ${camasDisponibles} camas disponibles. Total camas consideradas: ${totalCamas}. Ocupación: ${porcentajeOcupacion}%.`
    } else if (modo === 'excluir_servicio' && servicioObjetivo) {
      respuestaTexto = `Excluyendo ${servicioObjetivo}, hay ${camasDisponibles} camas disponibles. Total camas consideradas: ${totalCamas}. Ocupación: ${porcentajeOcupacion}%.`
    } else {
      respuestaTexto = `Hay ${camasDisponibles} camas disponibles. Total camas: ${totalCamas}. Ocupación: ${porcentajeOcupacion}%. ${camasBloqueadas} camas bloqueadas por aislamiento.`
    }
    
    return new Response(
      JSON.stringify({ respuesta: respuestaTexto, ok: true }),
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