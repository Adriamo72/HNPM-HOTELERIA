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
    // 1. PREGUNTAS SOBRE HABITACIÓN ESPECÍFICA
    // ============================================
    let numeroHabitacion = null
    let habitacionMatch = textoLower.match(/habitaci[oó]n\s*(\d+)/) || textoLower.match(/^(\d{3})$/)
    
    if (habitacionMatch) {
      numeroHabitacion = habitacionMatch[1]
      
      // Determinar fecha
      let fecha = new Date()
      let textoFecha = 'hoy'
      if (textoLower.includes('ayer')) {
        fecha.setDate(fecha.getDate() - 1)
        textoFecha = 'ayer'
      }
      const fechaStr = fecha.toISOString().split('T')[0]
      
      // Buscar la habitación
      const { data: habitacion, error: habError } = await supabase
        .from('habitaciones_especiales')
        .select('id, nombre, piso_id, pisos!habitaciones_especiales_piso_id_fkey (nombre_piso)')
        .eq('nombre', numeroHabitacion)
        .maybeSingle()
      
      if (habError || !habitacion) {
        return new Response(
          JSON.stringify({ respuesta: `No encontré la habitación ${numeroHabitacion}. Verificá el número.`, ok: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Buscar ocupación más reciente para esa fecha
      const { data: ocupacionData, error: occError } = await supabase
        .from('ocupacion_habitaciones')
        .select('*')
        .eq('habitacion_id', habitacion.id)
        .eq('fecha', fechaStr)
        .order('actualizado_en', { ascending: false })
        .limit(1)
      
      const ocupacion = ocupacionData?.[0]
      
      if (!ocupacion) {
        return new Response(
          JSON.stringify({ respuesta: `No hay datos de ocupación para la habitación ${numeroHabitacion} ${textoFecha === 'ayer' ? 'ayer' : 'hoy'}.`, ok: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const nombrePiso = habitacion.pisos?.nombre_piso || 'piso desconocido'
      const verbo = textoFecha === 'hoy' ? 'está' : 'estaba'
      
      let estado = `La habitación ${numeroHabitacion} ${verbo} `
      
      if (ocupacion.tipo_habitacion === 'activa') {
        const ocupadas = ocupacion.camas_ocupadas || 0
        const total = ocupacion.total_camas || 0
        const libres = total - ocupadas
        estado += `activa con ${ocupadas} de ${total} camas ocupadas (${libres} libre${libres !== 1 ? 's' : ''}).`
        
        if (ocupacion.aislamiento_activo === true) {
          estado += ` Tiene aislamiento activo.`
        }
        
        if (ocupacion.observaciones) {
          estado += ` Servicio: ${ocupacion.observaciones}.`
        }
      } else if (ocupacion.tipo_habitacion === 'reparacion') {
        estado += `en reparación.`
        if (ocupacion.observaciones) {
          estado += ` Motivo: ${ocupacion.observaciones}.`
        }
      } else {
        estado += `fuera de servicio (${ocupacion.tipo_habitacion || 'otros'}).`
      }
      
      estado += ` Ubicada en ${nombrePiso}.`
      
      return new Response(
        JSON.stringify({ respuesta: estado, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // 2. PREGUNTAS SOBRE RECHAZOS (simplificado)
    // ============================================
    if (textoLower.includes('rechazo') || textoLower.includes('iosfa') || textoLower.includes('pami')) {
      let fechaInicio = new Date()
      let fechaFin = new Date()
      let textoRango = 'hoy'
      
      if (textoLower.includes('ayer')) {
        fechaInicio.setDate(fechaInicio.getDate() - 1)
        fechaFin.setDate(fechaFin.getDate() - 1)
        textoRango = 'ayer'
      }
      
      const { data: rechazos } = await supabase
        .from('rechazos_pacientes')
        .select('*')
        .gte('fecha_rechazo', fechaInicio.toISOString())
        .lt('fecha_rechazo', fechaFin.toISOString())
      
      let filtrados = rechazos || []
      if (textoLower.includes('iosfa')) {
        filtrados = filtrados.filter(r => r.obra_social?.toLowerCase().includes('iosfa'))
      } else if (textoLower.includes('pami')) {
        filtrados = filtrados.filter(r => r.obra_social?.toLowerCase().includes('pami'))
      }
      
      let respuesta = `Hubo ${filtrados.length} rechazos`
      if (textoLower.includes('iosfa')) respuesta += ` de IOSFA`
      else if (textoLower.includes('pami')) respuesta += ` de PAMI`
      if (textoRango !== 'hoy') respuesta += ` ${textoRango}`
      respuesta += `.`
      
      return new Response(
        JSON.stringify({ respuesta, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // 3. OCUPACIÓN GENERAL
    // ============================================
    let fecha = new Date()
    let textoFecha = 'hoy'
    if (textoLower.includes('ayer')) {
      fecha.setDate(fecha.getDate() - 1)
      textoFecha = 'ayer'
    }
    
    const fechaStr = fecha.toISOString().split('T')[0]
    
    const { data: ocupaciones } = await supabase
      .from('ocupacion_habitaciones')
      .select(`
        *,
        habitaciones_especiales!ocupacion_habitaciones_habitacion_id_fkey (
          pisos!habitaciones_especiales_piso_id_fkey (nombre_piso)
        )
      `)
      .eq('fecha', fechaStr)
    
    let totalPacientes = 0
    let totalCamas = 0
    for (const occ of ocupaciones || []) {
      if (occ.tipo_habitacion === 'activa') {
        totalPacientes += occ.camas_ocupadas || 0
        totalCamas += occ.total_camas || 0
      }
    }
    
    const camasLibres = totalCamas - totalPacientes
    const porcentaje = totalCamas > 0 ? Math.round((totalPacientes / totalCamas) * 100) : 0
    const verbo = textoFecha === 'hoy' ? 'hay' : 'había'
    
    const respuesta = `${textoFecha === 'hoy' ? 'Hoy' : 'El ' + fechaStr} ${verbo} ${totalPacientes} pacientes internados (${porcentaje}% de ocupación, ${camasLibres} camas libres).`
    
    return new Response(
      JSON.stringify({ respuesta, ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, ok: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})