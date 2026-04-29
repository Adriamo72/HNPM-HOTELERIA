// supabase/functions/deepseek-bot/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Función auxiliar para normalizar texto
const norm = (str: string) => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Versión mínima de tu lógica de reglas (luego agregas todas)
function responderConReglas(mensaje: string, contexto: any) {
  const n = norm(mensaje)
  
  // Ejemplo: detectar saludo
  if (n.includes('hola') || n.includes('buenos días')) {
    return '¡Hola! Soy el asistente del hospital. ¿En qué puedo ayudarte?'
  }
  
  // Si no reconoce, devuelve que no entendió
  return 'No entendí la pregunta.'
}

async function responderConDeepSeek(mensaje: string, historial: any[], contexto: any) {
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY')
  
  if (!DEEPSEEK_API_KEY) {
    return 'Error: API key de DeepSeek no configurada.'
  }
  
  // Preparar contexto resumido
  const resumen = `Hospital con ${contexto.pisos?.length || 0} pisos y ${contexto.habitaciones?.length || 0} habitaciones.`
  
  const systemPrompt = `Eres un asistente de hospital. Sé conciso y útil. Datos: ${resumen}`
  
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...(historial || []).slice(-3).map((msg: any) => ({
            role: msg.tipo === 'user' ? 'user' : 'assistant',
            content: msg.texto
          })),
          { role: 'user', content: mensaje }
        ],
        temperature: 0.3,
        max_tokens: 300
      })
    })
    
    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'No pude procesar la pregunta.'
  } catch (error) {
    console.error('Error:', error)
    return 'Error al procesar. Intenta de nuevo.'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    const { mensaje, historial, contextoHospital } = await req.json()
    
    // Primero probar con reglas
    const respuestaReglas = responderConReglas(mensaje, contextoHospital)
    
    if (!respuestaReglas.includes('No entendí')) {
      return new Response(
        JSON.stringify({ respuesta: respuestaReglas, fuente: 'reglas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Si no, usar DeepSeek
    const respuestaIA = await responderConDeepSeek(mensaje, historial, contextoHospital)
    
    return new Response(
      JSON.stringify({ respuesta: respuestaIA, fuente: 'deepseek' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})