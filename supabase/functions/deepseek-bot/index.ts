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
    
    // Crear cliente de Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    
    // ============================================
    // DETECTAR PREGUNTAS SOBRE RECHAZOS
    // ============================================
    const esPreguntaRechazos = textoLower.includes('rechazo') || 
                                textoLower.includes('rechazos') ||
                                textoLower.includes('iosfa') ||
                                textoLower.includes('pami') ||
                                textoLower.includes('obra social') ||
                                textoLower.includes('motivo')
    
    if (esPreguntaRechazos) {
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
      }
      
      const fechaInicioStr = fechaInicio.toISOString()
      const fechaFinStr = fechaFin.toISOString()
      
      // Consultar rechazos
      let query = supabase
        .from('rechazos_pacientes')
        .select('*')
      
      if (textoLower.includes('ayer')) {
        query = query.gte('fecha_rechazo', fechaInicioStr)
                 .lt('fecha_rechazo', fechaFinStr)
      } else if (textoLower.includes('esta semana') || textoLower.includes('este mes')) {
        query = query.gte('fecha_rechazo', fechaInicioStr)
      }
      
      const { data: rechazos, error: rechazosError } = await query.order('fecha_rechazo', { ascending: false })
      
      if (rechazosError) {
        return new Response(
          JSON.stringify({ respuesta: `Error consultando rechazos: ${rechazosError.message}`, ok: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Filtrar por obra social si se menciona
      let obrasSocialesFiltradas = []
      if (textoLower.includes('iosfa')) {
        obrasSocialesFiltradas = rechazos?.filter(r => r.obra_social?.toLowerCase().includes('iosfa')) || []
      } else if (textoLower.includes('pami')) {
        obrasSocialesFiltradas = rechazos?.filter(r => r.obra_social?.toLowerCase().includes('pami')) || []
      } else if (textoLower.includes('swiss medical')) {
        obrasSocialesFiltradas = rechazos?.filter(r => r.obra_social?.toLowerCase().includes('swiss')) || []
      } else {
        obrasSocialesFiltradas = rechazos || []
      }
      
      // Detectar si pregunta por cantidad
      const preguntaCuantos = textoLower.includes('cuantos') || textoLower.includes('cuántos')
      
      // Detectar si pregunta por motivo principal
      const preguntaMotivo = textoLower.includes('motivo') || textoLower.includes('razón') || textoLower.includes('causa')
      
      if (preguntaMotivo) {
        // Agrupar por motivo
        const motivos: Record<string, number> = {}
        for (const r of obrasSocialesFiltradas) {
          const motivo = r.motivo || 'No especificado'
          motivos[motivo] = (motivos[motivo] || 0) + 1
        }
        
        // Encontrar el motivo más frecuente
        const motivoPrincipal = Object.entries(motivos).sort((a, b) => b[1] - a[1])[0]
        
        if (motivoPrincipal) {
          let respuesta = `El motivo de rechazo más frecuente es "${motivoPrincipal[0]}" con ${motivoPrincipal[1]} casos`
          if (textoRango !== 'hoy') respuesta += ` ${textoRango}`
          respuesta += `.`
          return new Response(
            JSON.stringify({ respuesta, ok: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      
      if (preguntaCuantos) {
        let respuesta = `Hubo ${obrasSocialesFiltradas.length} rechazos`
        
        // Identificar obra social
        if (textoLower.includes('iosfa')) respuesta += ` de IOSFA`
        else if (textoLower.includes('pami')) respuesta += ` de PAMI`
        else if (textoLower.includes('swiss')) respuesta += ` de Swiss Medical`
        
        if (textoRango !== 'hoy') respuesta += ` ${textoRango}`
        respuesta += `.`
        
        return new Response(
          JSON.stringify({ respuesta, ok: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Respuesta general sobre rechazos
      let respuesta = `Se registraron ${rechazos?.length || 0} rechazos de pacientes`
      if (textoRango !== 'hoy') respuesta += ` ${textoRango}`
      
      // Agregar desglose por obra social si hay datos
      if (rechazos && rechazos.length > 0) {
        const porObra: Record<string, number> = {}
        for (const r of rechazos) {
          const obra = r.obra_social || 'No especificada'
          porObra[obra] = (porObra[obra] || 0) + 1
        }
        const topObras = Object.entries(porObra).slice(0, 3)
        if (topObras.length > 0) {
          respuesta += `. Principales obras sociales: ${topObras.map(([obra, count]) => `${obra} (${count})`).join(', ')}`
        }
      }
      
      respuesta += `.`
      
      return new Response(
        JSON.stringify({ respuesta, ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================
    // PREGUNTAS SOBRE OCUPACIÓN (código anterior)
    // ============================================
    
    // Determinar la fecha
    let fecha = new Date()
    let textoFecha = 'hoy'
    
    if (textoLower.includes('ayer')) {
      fecha.setDate(fecha.getDate() - 1)
      textoFecha = 'ayer'
    } else if (textoLower.includes('anteayer')) {
      fecha.setDate(fecha.getDate() - 2)
      textoFecha = 'anteayer'
    }
    
    const fechaStr = fecha.toISOString().split('T')[0]
    
    const { data: ocupaciones, error } = await supabase
      .from('ocupacion_habitaciones')
      .select(`
        *,
        habitaciones_especiales!ocupacion_habitaciones_habitacion_id_fkey (
          id,
          nombre,
          piso_id,
          pisos!habitaciones_especiales_piso_id_fkey (
            id,
            nombre_piso
          )
        )
      `)
      .gte('fecha', `${fechaStr} 00:00:00`)
      .lte('fecha', `${fechaStr} 23:59:59`)
    
    if (error) {
      return new Response(
        JSON.stringify({ respuesta: `Error: ${error.message}`, ok: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Detectar piso
    let numeroPiso = null
    const palabrasANumero: Record<string, number> = {
      'primero': 1, 'primer': 1, '1': 1, '1er': 1, '1ro': 1,
      'segundo': 2, '2': 2, '2do': 2, '2°': 2,
      'tercero': 3, 'tercer': 3, '3': 3, '3er': 3, '3ro': 3,
      'cuarto': 4, '4': 4, '4to': 4, '4°': 4,
      'quinto': 5, '5': 5, '5to': 5, '5°': 5,
      'sexto': 6, '6': 6, '6to': 6, '6°': 6
    }
    
    for (const [palabra, num] of Object.entries(palabrasANumero)) {
      if (textoLower.includes(palabra)) {
        numeroPiso = num
        break
      }
    }
    
    let datosFiltrados = ocupaciones || []
    
    if (numeroPiso) {
      datosFiltrados = datosFiltrados.filter(occ => {
        const nombrePiso = occ.habitaciones_especiales?.pisos?.nombre_piso || ''
        const numeroEncontrado = nombrePiso.match(/\d+/)
        const pisoNumero = numeroEncontrado ? parseInt(numeroEncontrado[0]) : null
        return pisoNumero === numeroPiso
      })
    }
    
    // Calcular estadísticas
    let totalPacientes = 0
    let totalCamas = 0
    let pacientesAislamiento = 0
    let habitacionesReparacion = 0
    
    for (const occ of datosFiltrados || []) {
      if (occ.tipo_habitacion === 'activa') {
        totalPacientes += occ.camas_ocupadas || 0
        totalCamas += occ.total_camas || 0
        if (occ.aislamiento_activo === true) {
          pacientesAislamiento += occ.camas_ocupadas || 0
        }
      } else if (occ.tipo_habitacion === 'reparacion') {
        habitacionesReparacion++
      }
    }
    
    const camasLibres = totalCamas - totalPacientes
    const ocupacionPorcentaje = totalCamas > 0 ? Math.round((totalPacientes / totalCamas) * 100) : 0
    
    let nombrePisoMostrar = ''
    if (numeroPiso && datosFiltrados.length > 0) {
      const primerPiso = datosFiltrados[0]?.habitaciones_especiales?.pisos?.nombre_piso || `PISO ${numeroPiso}`
      nombrePisoMostrar = primerPiso
    } else if (numeroPiso) {
      nombrePisoMostrar = `PISO ${numeroPiso}`
    }
    
    const verbo = textoFecha === 'hoy' ? 'hay' : 'había'
    let respuesta = ''
    
    const preguntaCamasLibres = textoLower.includes('camas libres') || textoLower.includes('camas disponibles')
    const preguntaAislamiento = textoLower.includes('aislamiento')
    
    if (preguntaCamasLibres) {
      respuesta = `${textoFecha === 'hoy' ? 'Hoy' : 'El ' + fechaStr} ${verbo} ${camasLibres} camas libres`
      if (nombrePisoMostrar) respuesta += ` en ${nombrePisoMostrar}`
      respuesta += ` (${totalPacientes} pacientes ocupando ${totalCamas} camas).`
    } 
    else if (preguntaAislamiento) {
      respuesta = `${textoFecha === 'hoy' ? 'Hoy' : 'El ' + fechaStr} ${verbo} ${pacientesAislamiento} pacientes en aislamiento`
      if (nombrePisoMostrar) respuesta += ` en ${nombrePisoMostrar}`
      respuesta += `.`
    }
    else {
      respuesta = `${textoFecha === 'hoy' ? 'Hoy' : 'El ' + fechaStr} ${verbo} ${totalPacientes} pacientes internados`
      if (nombrePisoMostrar) respuesta += ` en ${nombrePisoMostrar}`
      respuesta += ` (${ocupacionPorcentaje}% de ocupación, ${camasLibres} camas libres).`
      if (pacientesAislamiento > 0 && !preguntaAislamiento) {
        respuesta += ` ${pacientesAislamiento} pacientes están en aislamiento.`
      }
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