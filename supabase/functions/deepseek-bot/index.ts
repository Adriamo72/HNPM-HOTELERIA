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
    // 1. PREGUNTAS SOBRE RECHAZOS (CORREGIDO)
    // ============================================
    const esRechazo = textoLower.includes('rechazo') || 
                      textoLower.includes('rechazos') ||
                      textoLower.includes('iosfa') || 
                      textoLower.includes('pami') ||
                      textoLower.includes('obra social')
    
    if (esRechazo) {
      console.log("Detectada pregunta sobre rechazos")
      
      // Determinar rango de fechas
      let fechaInicio = new Date()
      let fechaFin = new Date()
      let textoRango = 'hoy'
      
      if (textoLower.includes('ayer')) {
        fechaInicio.setDate(fechaInicio.getDate() - 1)
        fechaFin.setDate(fechaFin.getDate() - 1)
        textoRango = 'ayer'
      } else if (textoLower.includes('esta semana')) {
        fechaInicio.setDate(fechaInicio.getDate() - fechaInicio.getDay())
        textoRango = 'esta semana'
      } else if (textoLower.includes('este mes')) {
        fechaInicio = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1)
        textoRango = 'este mes'
      } else {
        // Por defecto, buscar últimos 7 días
        fechaInicio.setDate(fechaInicio.getDate() - 7)
        textoRango = 'los últimos 7 días'
      }
      
      // Consultar rechazos
      let query = supabase
        .from('rechazos_pacientes')
        .select('*')
        .gte('fecha_rechazo', fechaInicio.toISOString())
      
      if (textoLower.includes('ayer')) {
        query = query.lt('fecha_rechazo', fechaFin.toISOString())
      }
      
      const { data: rechazos, error } = await query.order('fecha_rechazo', { ascending: false })
      
      if (error) {
        console.error("Error consultando rechazos:", error)
        return new Response(
          JSON.stringify({ respuesta: `Error consultando rechazos: ${error.message}`, ok: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log(`Total rechazos encontrados: ${rechazos?.length || 0}`)
      
      // Filtrar por obra social si se menciona
      let filtrados = rechazos || []
      if (textoLower.includes('iosfa')) {
        filtrados = filtrados.filter(r => r.obra_social?.toLowerCase().includes('iosfa'))
        console.log(`Rechazos de IOSFA: ${filtrados.length}`)
      } else if (textoLower.includes('pami')) {
        filtrados = filtrados.filter(r => r.obra_social?.toLowerCase().includes('pami'))
      }
      
      // Si pregunta por el motivo principal
      if (textoLower.includes('motivo') || textoLower.includes('razón')) {
        const motivos: Record<string, number> = {}
        for (const r of filtrados) {
          const motivo = r.motivo || 'No especificado'
          motivos[motivo] = (motivos[motivo] || 0) + 1
        }
        const motivoPrincipal = Object.entries(motivos).sort((a, b) => b[1] - a[1])[0]
        
        if (motivoPrincipal) {
          const respuesta = `El motivo de rechazo más frecuente es "${motivoPrincipal[0]}" con ${motivoPrincipal[1]} casos ${textoRango !== 'hoy' ? textoRango : ''}.`
          return new Response(
            JSON.stringify({ respuesta, ok: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      
      // Respuesta normal: cuántos rechazos hubo
      let respuesta = `Hubo ${filtrados.length} rechazos`
      if (textoLower.includes('iosfa')) respuesta += ` de IOSFA`
      else if (textoLower.includes('pami')) respuesta += ` de PAMI`
      if (textoRango === 'los últimos 7 días') respuesta += ` en ${textoRango}`
      else if (textoRango !== 'hoy') respuesta += ` ${textoRango}`
      respuesta += `.`
      
      // Si hay 0 rechazos pero el usuario espera verlos, mostrar mensaje más claro
      if (filtrados.length === 0 && (textoLower.includes('iosfa') || textoLower.includes('pami'))) {
        respuesta = `No se encontraron rechazos de ${textoLower.includes('iosfa') ? 'IOSFA' : 'PAMI'} en ${textoRango === 'los últimos 7 días' ? 'los últimos 7 días' : textoRango}.`
      }
      
      return new Response(
        JSON.stringify({ respuesta, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // 2. PREGUNTAS SOBRE HABITACIÓN ESPECÍFICA
    // (código existente...)
    // ============================================
    
    let numeroHabitacion = null
    let habitacionMatch = textoLower.match(/habitaci[oó]n\s*(\d+)/) || textoLower.match(/^(\d{3})$/)
    
    if (habitacionMatch) {
      numeroHabitacion = habitacionMatch[1]
      
      let fecha = new Date()
      let textoFecha = 'hoy'
      if (textoLower.includes('ayer')) {
        fecha.setDate(fecha.getDate() - 1)
        textoFecha = 'ayer'
      }
      const fechaStr = fecha.toISOString().split('T')[0]
      
      const { data: habitacion } = await supabase
        .from('habitaciones_especiales')
        .select('id, nombre, piso_id, pisos!habitaciones_especiales_piso_id_fkey (nombre_piso)')
        .eq('nombre', numeroHabitacion)
        .maybeSingle()
      
      if (!habitacion) {
        return new Response(
          JSON.stringify({ respuesta: `No encontré la habitación ${numeroHabitacion}.`, ok: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const { data: ocupacionData } = await supabase
        .from('ocupacion_habitaciones')
        .select('*')
        .eq('habitacion_id', habitacion.id)
        .eq('fecha', fechaStr)
        .order('actualizado_en', { ascending: false })
        .limit(1)
      
      const ocupacion = ocupacionData?.[0]
      
      if (!ocupacion) {
        return new Response(
          JSON.stringify({ respuesta: `No hay datos de ocupación para la habitación ${numeroHabitacion} ${textoFecha}.`, ok: true }),
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
        if (ocupacion.aislamiento_activo === true) estado += ` Tiene aislamiento activo.`
        if (ocupacion.observaciones) estado += ` Servicio: ${ocupacion.observaciones}.`
      } else if (ocupacion.tipo_habitacion === 'reparacion') {
        estado += `en reparación.`
      } else {
        estado += `fuera de servicio.`
      }
      estado += ` Ubicada en ${nombrePiso}.`
      
      return new Response(
        JSON.stringify({ respuesta: estado, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // 3. OCUPACIÓN POR PISO
    // (código existente...)
    // ============================================
    
    let numeroPiso = null
    let nombrePisoMostrar = null
    
    if (textoLower.includes('cuarto') || textoLower.includes('4')) {
      numeroPiso = 4
      nombrePisoMostrar = 'PISO 4'
    } else if (textoLower.includes('quinto') || textoLower.includes('5')) {
      numeroPiso = 5
      nombrePisoMostrar = 'PISO 5'
    } else if (textoLower.includes('tercer') || textoLower.includes('3')) {
      numeroPiso = 3
      nombrePisoMostrar = 'PISO 3'
    } else if (textoLower.includes('segundo') || textoLower.includes('2')) {
      numeroPiso = 2
      nombrePisoMostrar = 'PISO 2'
    } else if (textoLower.includes('primero') || textoLower.includes('1')) {
      numeroPiso = 1
      nombrePisoMostrar = 'PISO 1'
    } else if (textoLower.includes('sexto') || textoLower.includes('6')) {
      numeroPiso = 6
      nombrePisoMostrar = 'PISO 6'
    }
    
    if (!numeroPiso) {
      return new Response(
        JSON.stringify({ respuesta: "¿Sobre qué piso querés consultar? (Ej: 'cuarto piso', 'quinto piso')", ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const { data: pisoData } = await supabase
      .from('pisos')
      .select('id')
      .eq('nombre_piso', nombrePisoMostrar)
      .single()
    
    if (!pisoData) {
      return new Response(
        JSON.stringify({ respuesta: `No encontré información para ${nombrePisoMostrar}.`, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const { data: habitacionesPiso } = await supabase
      .from('habitaciones_especiales')
      .select('id')
      .eq('piso_id', pisoData.id)
    
    const habitacionIds = habitacionesPiso?.map(h => h.id) || []
    
    if (habitacionIds.length === 0) {
      return new Response(
        JSON.stringify({ respuesta: `No hay habitaciones registradas en ${nombrePisoMostrar}.`, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const hoy = new Date().toISOString().split('T')[0]
    
    const { data: ocupaciones, error: occError } = await supabase
      .from('ocupacion_habitaciones')
      .select('camas_ocupadas, total_camas, tipo_habitacion, aislamiento_activo')
      .eq('fecha', hoy)
      .in('habitacion_id', habitacionIds)
    
    if (occError) {
      return new Response(
        JSON.stringify({ respuesta: `Error consultando ocupación: ${occError.message}`, ok: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    let totalPacientes = 0
    let totalCamas = 0
    let pacientesAislamiento = 0
    
    for (const occ of ocupaciones || []) {
      if (occ.tipo_habitacion === 'activa') {
        totalPacientes += occ.camas_ocupadas || 0
        totalCamas += occ.total_camas || 0
        if (occ.aislamiento_activo === true) {
          pacientesAislamiento += occ.camas_ocupadas || 0
        }
      }
    }
    
    const camasLibres = totalCamas - totalPacientes
    const porcentaje = totalCamas > 0 ? Math.round((totalPacientes / totalCamas) * 100) : 0
    
    let respuesta = `Hoy hay ${totalPacientes} pacientes internados en ${nombrePisoMostrar} (${porcentaje}% de ocupación, ${camasLibres} camas libres).`
    if (pacientesAislamiento > 0) {
      respuesta += ` ${pacientesAislamiento} pacientes en aislamiento.`
    }
    
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