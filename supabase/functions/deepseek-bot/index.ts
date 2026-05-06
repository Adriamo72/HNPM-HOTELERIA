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
    // DETECTAR EXCLUSIONES MANUALMENTE
    // ============================================
    let pisosExcluir: number[] = []
    let serviciosExcluir: string[] = []
    
    // Detectar pisos a excluir
    if (textoLower.includes('piso 2') || textoLower.includes('segundo piso')) {
      pisosExcluir.push(2)
    }
    if (textoLower.includes('piso 3') || textoLower.includes('tercer piso')) {
      pisosExcluir.push(3)
    }
    if (textoLower.includes('piso 4') || textoLower.includes('cuarto piso')) {
      pisosExcluir.push(4)
    }
    if (textoLower.includes('piso 5') || textoLower.includes('quinto piso')) {
      pisosExcluir.push(5)
    }
    if (textoLower.includes('piso 6') || textoLower.includes('sexto piso')) {
      pisosExcluir.push(6)
    }
    
    // Detectar servicios a excluir
    if (textoLower.includes('uco')) {
      serviciosExcluir.push('UCO')
    }
    if (textoLower.includes('uti')) {
      serviciosExcluir.push('UTI')
    }
    if (textoLower.includes('cirugía') || textoLower.includes('cirugia')) {
      serviciosExcluir.push('CIRUGÍA')
    }
    if (textoLower.includes('pediatría') || textoLower.includes('pediatria')) {
      serviciosExcluir.push('PEDIATRÍA')
    }
    
    console.log("Pisos a excluir:", pisosExcluir)
    console.log("Servicios a excluir:", serviciosExcluir)
    
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
    // CALCULAR CAMAS DISPONIBLES CON FILTROS
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
      
      // Verificar exclusiones
      if (pisosExcluir.includes(pisoNumero)) {
        console.log(`Excluyendo habitación ${hab.nombre} (${pisoNombre}) por piso`)
        continue
      }
      if (serviciosExcluir.some(s => servicio.includes(s))) {
        console.log(`Excluyendo habitación ${hab.nombre} (${servicio}) por servicio`)
        continue
      }
      
      const camas = ocupacionActual.total_camas || 0
      const ocupadas = ocupacionActual.camas_ocupadas || 0
      const aislamiento = ocupacionActual.aislamiento_activo === true
      
      totalCamas += camas
      totalPacientes += ocupadas
      
      // Calcular camas bloqueadas por aislamiento (misma lógica que tu dashboard)
      if (aislamiento) {
        if (ocupadas > 0) {
          // Si hay pacientes en habitación con aislamiento, todas las camas se bloquean
          camasBloqueadas += (camas - ocupadas)
        }
        // Si no hay pacientes en habitación con aislamiento, las camas están disponibles
      }
    }
    
    const camasDisponibles = totalCamas - totalPacientes - camasBloqueadas
    const porcentajeOcupacion = totalCamas > 0 ? Math.round((totalPacientes / totalCamas) * 100) : 0
    
    // ============================================
    // CONSTRUIR RESPUESTA
    // ============================================
    let respuestaTexto = `Hay ${camasDisponibles} camas disponibles`
    
    if (pisosExcluir.length > 0) {
      respuestaTexto += ` (excluyendo ${pisosExcluir.map(p => `PISO ${p}`).join(' y ')})`
    }
    if (serviciosExcluir.length > 0) {
      respuestaTexto += ` (excluyendo ${serviciosExcluir.join(' y ')})`
    }
    
    respuestaTexto += `. Total camas consideradas: ${totalCamas}. Ocupación: ${porcentajeOcupacion}%.`
    
    if (camasBloqueadas > 0) {
      respuestaTexto += ` ${camasBloqueadas} camas bloqueadas por aislamiento.`
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