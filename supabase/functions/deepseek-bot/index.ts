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
    // OBTENER TODAS LAS HABITACIONES CON SU ESTADO MÁS RECIENTE
    // ============================================
    const { data: todasOcupaciones, error: errorOcupaciones } = await supabase
      .from('ocupacion_habitaciones')
      .select('*')
      .order('actualizado_en', { ascending: false })
    
    if (errorOcupaciones) {
      return new Response(
        JSON.stringify({ respuesta: `Error: ${errorOcupaciones.message}`, ok: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // DEDUPLICAR: quedarse con el registro más reciente por habitación
    const mapaUltimoEstado = new Map()
    for (const registro of todasOcupaciones || []) {
      if (!mapaUltimoEstado.has(registro.habitacion_id)) {
        mapaUltimoEstado.set(registro.habitacion_id, registro)
      }
    }
    
    const ocupacionesRecientes = Array.from(mapaUltimoEstado.values())
    
    // Obtener nombres de habitaciones y pisos
    const { data: habitacionesData } = await supabase
      .from('habitaciones_especiales')
      .select('id, nombre, piso_id')
    
    const { data: pisosData } = await supabase
      .from('pisos')
      .select('id, nombre_piso')
    
    const mapaHabitaciones = new Map()
    for (const hab of habitacionesData || []) {
      mapaHabitaciones.set(hab.id, { nombre: hab.nombre, piso_id: hab.piso_id })
    }
    
    const mapaPisos = new Map()
    for (const piso of pisosData || []) {
      mapaPisos.set(piso.id, piso.nombre_piso)
    }
    
    // Enriquecer ocupaciones con nombre de habitación y piso
    const datosCompletos = ocupacionesRecientes.map(occ => {
      const habitacion = mapaHabitaciones.get(occ.habitacion_id)
      return {
        ...occ,
        habitacion_nombre: habitacion?.nombre || 'Desconocida',
        piso_nombre: mapaPisos.get(habitacion?.piso_id) || 'Desconocido'
      }
    }).filter(d => d.habitacion_nombre !== 'Desconocida')
    
    // ============================================
    // 1. PREGUNTAS SOBRE HABITACIÓN ESPECÍFICA
    // ============================================
    let numeroHabitacion = null
    let habitacionMatch = textoLower.match(/habitaci[oó]n\s*(\d+)/) || textoLower.match(/^(\d{3})$/)
    
    if (habitacionMatch) {
      numeroHabitacion = habitacionMatch[1]
      const habitacionData = datosCompletos.find(d => d.habitacion_nombre === numeroHabitacion)
      
      if (!habitacionData) {
        return new Response(
          JSON.stringify({ respuesta: `No encontré información para la habitación ${numeroHabitacion}.`, ok: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const ocupadas = habitacionData.camas_ocupadas || 0
      const total = habitacionData.total_camas || 0
      const libres = total - ocupadas
      
      let respuesta = `La habitación ${numeroHabitacion} está ${habitacionData.tipo_habitacion === 'reparacion' ? 'en reparación' : 'activa'} con ${ocupadas} de ${total} camas ocupadas (${libres} libres).`
      if (habitacionData.aislamiento_activo) respuesta += ` Tiene aislamiento activo.`
      if (habitacionData.observaciones) respuesta += ` Servicio: ${habitacionData.observaciones}.`
      respuesta += ` Ubicada en ${habitacionData.piso_nombre}.`
      
      return new Response(
        JSON.stringify({ respuesta, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // 2. HABITACIONES EN REPARACIÓN
    // ============================================
    if (textoLower.includes('reparacion') || textoLower.includes('reparación')) {
      let pisoObjetivo: string | null = null
      if (textoLower.includes('piso 6') || textoLower.includes('sexto piso')) pisoObjetivo = 'PISO 6'
      if (textoLower.includes('piso 5') || textoLower.includes('quinto piso')) pisoObjetivo = 'PISO 5'
      if (textoLower.includes('piso 4') || textoLower.includes('cuarto piso')) pisoObjetivo = 'PISO 4'
      if (textoLower.includes('piso 3') || textoLower.includes('tercer piso')) pisoObjetivo = 'PISO 3'
      if (textoLower.includes('piso 2') || textoLower.includes('segundo piso')) pisoObjetivo = 'PISO 2'
      if (textoLower.includes('piso 1') || textoLower.includes('primer piso')) pisoObjetivo = 'PISO 1'
      
      const reparaciones = datosCompletos.filter(d => 
        d.tipo_habitacion === 'reparacion' &&
        (pisoObjetivo === null || d.piso_nombre === pisoObjetivo)
      ).map(d => d.habitacion_nombre)
      
      if (reparaciones.length === 0) {
        const respuesta = pisoObjetivo 
          ? `No hay habitaciones en reparación en ${pisoObjetivo}.`
          : `No hay habitaciones en reparación en el hospital.`
        return new Response(
          JSON.stringify({ respuesta, ok: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const respuesta = pisoObjetivo
        ? `Habitaciones en reparación en ${pisoObjetivo}: ${reparaciones.join(', ')}.`
        : `Habitaciones en reparación en el hospital: ${reparaciones.join(', ')}.`
      
      return new Response(
        JSON.stringify({ respuesta, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // 3. PREGUNTAS CON EXCLUSIONES
    // ============================================
    const tieneExclusion = textoLower.includes('exceptuando') || textoLower.includes('excluyendo') || textoLower.includes('sin contar') || textoLower.includes('menos')
    
    let pisosExcluidos: string[] = []
    let serviciosExcluidos: string[] = []
    
    if (textoLower.includes('piso 2') || textoLower.includes('segundo piso')) pisosExcluidos.push('PISO 2')
    if (textoLower.includes('uco')) serviciosExcluidos.push('UCO')
    
    let datosFiltrados = datosCompletos.filter(d => d.tipo_habitacion === 'activa')
    
    if (pisosExcluidos.length > 0) {
      datosFiltrados = datosFiltrados.filter(d => !pisosExcluidos.includes(d.piso_nombre))
    }
    if (serviciosExcluidos.length > 0) {
      datosFiltrados = datosFiltrados.filter(d => {
        const servicio = (d.observaciones || '').toUpperCase()
        return !serviciosExcluidos.some(s => servicio.includes(s))
      })
    }
    
    let totalCamas = 0
    let totalPacientes = 0
    let camasBloqueadas = 0
    
    for (const d of datosFiltrados) {
      totalCamas += d.total_camas || 0
      totalPacientes += d.camas_ocupadas || 0
      if (d.aislamiento_activo && (d.camas_ocupadas || 0) > 0) {
        camasBloqueadas += (d.total_camas || 0) - (d.camas_ocupadas || 0)
      }
    }
    
    const camasDisponibles = totalCamas - totalPacientes - camasBloqueadas
    const porcentaje = totalCamas > 0 ? Math.round((totalPacientes / totalCamas) * 100) : 0
    
    // ============================================
    // 4. PREGUNTAS POR PISO
    // ============================================
    let pisoEspecifico: string | null = null
    if (textoLower.includes('piso 6') || textoLower.includes('sexto piso')) pisoEspecifico = 'PISO 6'
    else if (textoLower.includes('piso 5') || textoLower.includes('quinto piso')) pisoEspecifico = 'PISO 5'
    else if (textoLower.includes('piso 4') || textoLower.includes('cuarto piso')) pisoEspecifico = 'PISO 4'
    else if (textoLower.includes('piso 3') || textoLower.includes('tercer piso')) pisoEspecifico = 'PISO 3'
    else if (textoLower.includes('piso 2') || textoLower.includes('segundo piso')) pisoEspecifico = 'PISO 2'
    else if (textoLower.includes('piso 1') || textoLower.includes('primer piso')) pisoEspecifico = 'PISO 1'
    
    if (pisoEspecifico && !tieneExclusion) {
      const datosPiso = datosCompletos.filter(d => d.tipo_habitacion === 'activa' && d.piso_nombre === pisoEspecifico)
      let camasPiso = 0
      let pacientesPiso = 0
      let bloqueadasPiso = 0
      
      for (const d of datosPiso) {
        camasPiso += d.total_camas || 0
        pacientesPiso += d.camas_ocupadas || 0
        if (d.aislamiento_activo && (d.camas_ocupadas || 0) > 0) {
          bloqueadasPiso += (d.total_camas || 0) - (d.camas_ocupadas || 0)
        }
      }
      
      const disponiblesPiso = camasPiso - pacientesPiso - bloqueadasPiso
      const porcentajePiso = camasPiso > 0 ? Math.round((pacientesPiso / camasPiso) * 100) : 0
      
      const respuesta = `En ${pisoEspecifico} hay ${disponiblesPiso} camas disponibles. Total camas: ${camasPiso}. Ocupación: ${porcentajePiso}%.`
      
      return new Response(
        JSON.stringify({ respuesta, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // 5. RESPUESTA GENERAL (con exclusiones si aplica)
    // ============================================
    let respuesta = `Hay ${camasDisponibles} camas disponibles`
    
    if (pisosExcluidos.length > 0) {
      respuesta += ` (excluyendo ${pisosExcluidos.join(' y ')})`
    }
    if (serviciosExcluidos.length > 0) {
      respuesta += ` (excluyendo ${serviciosExcluidos.join(' y ')})`
    }
    
    respuesta += `. Total camas: ${totalCamas}. Ocupación: ${porcentaje}%. ${camasBloqueadas} camas bloqueadas por aislamiento.`
    
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