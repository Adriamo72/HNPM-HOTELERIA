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
    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Token requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Buscar semáforo por token
    const { data: semaforo, error: semError } = await supabase
      .from('semaforos')
      .select('id, nombre, piso_id')
      .eq('qr_token', token)
      .single()

    if (semError || !semaforo) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Semáforo no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const ahora = new Date().toISOString()

    // Actualizar ultimo_escaneo_at en semaforos
    await supabase
      .from('semaforos')
      .update({ ultimo_escaneo_at: ahora })
      .eq('id', semaforo.id)

    // Registrar en historial
    await supabase
      .from('semaforo_escaneos')
      .insert({ semaforo_id: semaforo.id, escaneado_at: ahora })

    return new Response(
      JSON.stringify({ ok: true, semaforo: semaforo.nombre, escaneado_at: ahora }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
