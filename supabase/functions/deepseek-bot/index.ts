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
    const { mensaje, historial } = await req.json()

    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!groqApiKey) {
      return new Response(
        JSON.stringify({ respuesta: 'Error de configuración: falta la API key de Groq.', ok: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ============================================
    // OBTENER DATOS REALES DEL HOSPITAL
    // ============================================
    const [resOcupaciones, resHabitaciones, resPisos, resRechazos] = await Promise.all([
      supabase.from('ocupacion_habitaciones').select('*').order('actualizado_en', { ascending: false }),
      supabase.from('habitaciones_especiales').select('id, nombre, piso_id'),
      supabase.from('pisos').select('id, nombre_piso'),
      supabase.from('rechazos_pacientes').select('*').order('created_at', { ascending: false }).limit(50),
    ])

    // Deduplicar: quedarse con el estado más reciente por habitación
    const mapaUltimoEstado = new Map()
    for (const reg of resOcupaciones.data || []) {
      if (!mapaUltimoEstado.has(reg.habitacion_id)) {
        mapaUltimoEstado.set(reg.habitacion_id, reg)
      }
    }

    const mapaHabs = new Map()
    for (const h of resHabitaciones.data || []) {
      mapaHabs.set(h.id, h)
    }

    const mapaPisos = new Map()
    for (const p of resPisos.data || []) {
      mapaPisos.set(p.id, p.nombre_piso)
    }

    // Construir resumen estructurado por piso
    const resumenPorPiso: Record<string, {
      totalCamas: number
      camasOcupadas: number
      camasDisponibles: number
      camasBloqueadas: number
      habitaciones: Array<{
        nombre: string
        tipo: string
        camas: number
        ocupadas: number
        aislamiento: boolean
        servicio: string
      }>
    }> = {}

    for (const [habId, occ] of mapaUltimoEstado.entries()) {
      const hab = mapaHabs.get(habId)
      if (!hab) continue
      const pisoNombre = mapaPisos.get(hab.piso_id) || 'Sin piso'

      if (!resumenPorPiso[pisoNombre]) {
        resumenPorPiso[pisoNombre] = { totalCamas: 0, camasOcupadas: 0, camasDisponibles: 0, camasBloqueadas: 0, habitaciones: [] }
      }

      const total = occ.total_camas || 0
      const ocupadas = Math.min(total, Math.max(0, occ.camas_ocupadas || 0))
      const bloqueadas = (occ.aislamiento_activo && ocupadas > 0) ? Math.max(0, total - ocupadas) : 0

      resumenPorPiso[pisoNombre].totalCamas += total
      resumenPorPiso[pisoNombre].camasOcupadas += ocupadas
      resumenPorPiso[pisoNombre].camasBloqueadas += bloqueadas

      if (occ.tipo_habitacion === 'activa') {
        resumenPorPiso[pisoNombre].camasDisponibles += Math.max(0, total - ocupadas - bloqueadas)
      }

      resumenPorPiso[pisoNombre].habitaciones.push({
        nombre: hab.nombre,
        tipo: occ.tipo_habitacion === 'activa' ? 'INTERNACIÓN' : occ.tipo_habitacion === 'reparacion' ? 'EN REPARACIÓN' : 'OTROS',
        camas: total,
        ocupadas,
        aislamiento: Boolean(occ.aislamiento_activo),
        servicio: occ.observaciones || ''
      })
    }

    // Totales globales
    let globalCamas = 0, globalOcupadas = 0, globalDisponibles = 0, globalBloqueadas = 0
    for (const piso of Object.values(resumenPorPiso)) {
      globalCamas += piso.totalCamas
      globalOcupadas += piso.camasOcupadas
      globalDisponibles += piso.camasDisponibles
      globalBloqueadas += piso.camasBloqueadas
    }

    // Resumen de rechazos recientes
    const rechazosRecientes = (resRechazos.data || []).slice(0, 10).map(r => ({
      paciente: `${r.apellido || ''} ${r.nombre || ''}`.trim() || 'Sin nombre',
      causa: r.causa_rechazo || r.causa || 'Sin causa',
      obraSocial: r.obra_social || 'Sin dato',
      fecha: r.created_at ? new Date(r.created_at).toLocaleDateString('es-AR') : 'Sin fecha'
    }))

    // ============================================
    // SYSTEM PROMPT CON CONTEXTO REAL
    // ============================================
    const contextoPisos = Object.entries(resumenPorPiso)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([piso, datos]) => {
        const habsDetalle = datos.habitaciones
          .sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }))
          .map(h => {
            let info = `  - Hab ${h.nombre}: ${h.tipo}`
            if (h.tipo === 'INTERNACIÓN') {
              info += `, ${h.camas} camas total, ${h.ocupadas} ocupadas`
              if (h.aislamiento) info += ` [AISLAMIENTO ACTIVO]`
              if (h.servicio) info += `, servicio: ${h.servicio}`
            }
            return info
          }).join('\n')
        return `**${piso}**: ${datos.totalCamas} camas totales, ${datos.camasOcupadas} ocupadas, ${datos.camasDisponibles} disponibles, ${datos.camasBloqueadas} bloqueadas por aislamiento\n${habsDetalle}`
      }).join('\n\n')

    const systemPrompt = `Sos el asistente de hotelería del Hospital Nacional Posadas (HNPM). Respondés preguntas sobre ocupación de camas, estado de habitaciones, rechazos de pacientes y métricas del hospital. Respondés en español rioplatense, de forma clara y concisa.

DATOS ACTUALES DEL HOSPITAL (en tiempo real):
- Total global: ${globalCamas} camas, ${globalOcupadas} ocupadas, ${globalDisponibles} disponibles, ${globalBloqueadas} bloqueadas por aislamiento
- Ocupación global: ${globalCamas > 0 ? Math.round((globalOcupadas / globalCamas) * 100) : 0}%

DETALLE POR PISO:
${contextoPisos}

RECHAZOS RECIENTES (últimos ${rechazosRecientes.length}):
${rechazosRecientes.length > 0
  ? rechazosRecientes.map(r => `- ${r.paciente} | ${r.obraSocial} | ${r.causa} | ${r.fecha}`).join('\n')
  : '- Sin rechazos recientes'}

INSTRUCCIONES:
- Usá SIEMPRE los datos reales de arriba para responder. Nunca inventes números.
- Si te preguntan por un piso específico, filtrá exactamente por ese piso en los datos.
- Si te preguntan por una habitación específica, buscala en el detalle de habitaciones.
- Podés calcular porcentajes, comparar pisos, detectar el piso más ocupado, etc.
- Si una pregunta no tiene respuesta en los datos, decilo claramente.
- Respondé de forma breve y directa. Usá negrita (**texto**) para resaltar números clave.`

    // ============================================
    // CONSTRUIR HISTORIAL DE CONVERSACIÓN
    // ============================================
    const mensajesHistorial = (historial || [])
      .filter((m: { tipo: string; texto: string }) => m.tipo === 'user' || m.tipo === 'bot')
      .slice(-6)
      .map((m: { tipo: string; texto: string }) => ({
        role: m.tipo === 'user' ? 'user' : 'assistant',
        content: m.texto.slice(0, 300)
      }))

    const mensajesApi = [
      { role: 'system', content: systemPrompt },
      ...mensajesHistorial,
      { role: 'user', content: mensaje }
    ]

    // ============================================
    // LLAMAR A GROQ API (gratis)
    // ============================================
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: mensajesApi,
        max_tokens: 512,
        temperature: 0.2,
      }),
    })

    if (!groqRes.ok) {
      const errorText = await groqRes.text()
      console.error('Groq API error:', groqRes.status, errorText)
      return new Response(
        JSON.stringify({ respuesta: 'Error al contactar la IA. Por favor, intentá de nuevo en unos segundos.', ok: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const groqData = await groqRes.json()
    const respuesta = groqData.choices?.[0]?.message?.content || 'No pude generar una respuesta.'

    return new Response(
      JSON.stringify({ respuesta, ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error.message)
    return new Response(
      JSON.stringify({ respuesta: 'Ocurrió un error interno. Por favor, intentá de nuevo.', ok: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})