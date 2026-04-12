import { createClient } from 'npm:@supabase/supabase-js@2';

type IncomingPayload = {
  gmailMessageId?: string;
  from?: string;
  subject?: string;
  body?: string;
  pacienteNombre?: string;
  pacienteApellido?: string;
  responsableMi?: string;
  obraSocial?: string;
  motivo?: string;
  diagnostico?: string;
  fechaRechazo?: string;
  metadata?: Record<string, unknown>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const extraerDatoMail = (texto: string, etiquetas: string[]): string => {
  if (!texto) return '';

  for (const etiqueta of etiquetas) {
    const escaped = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}\\s*:\\s*(.*?)(?=,\\s*[A-ZÁÉÍÓÚÑ. ]+\\s*:|$)`, 'i');
    const match = texto.match(regex);
    if (match?.[1]) return match[1].trim();
  }

  return '';
};

const parsePaciente = (valor: string) => {
  const partes = valor.split(/\s+/).filter(Boolean);
  const [apellido = '', ...restoNombre] = partes;
  return {
    apellido,
    nombre: restoNombre.join(' '),
  };
};

const normalizarPayload = (payload: IncomingPayload) => {
  const body = payload.body?.trim() || '';
  const pacienteMail = extraerDatoMail(body, ['Paciente']);
  const paciente = parsePaciente(pacienteMail);

  return {
    gmail_message_id: payload.gmailMessageId || null,
    remitente_email: payload.from || null,
    asunto_email: payload.subject || null,
    cuerpo_email: body || null,
    paciente_nombre: payload.pacienteNombre || paciente.nombre || null,
    paciente_apellido: payload.pacienteApellido || paciente.apellido || null,
    responsable_mi: payload.responsableMi || extraerDatoMail(body, ['Responsable M.I', 'Responsable MI', 'Responsable']) || null,
    obra_social: payload.obraSocial || extraerDatoMail(body, ['OOSS', 'Obra social']) || null,
    motivo: payload.motivo || extraerDatoMail(body, ['Motivo', 'Causa']) || null,
    diagnostico: payload.diagnostico || extraerDatoMail(body, ['Diagnostico', 'Diagnóstico']) || null,
    fecha_rechazo: payload.fechaRechazo || new Date().toISOString(),
    origen: 'gmail',
    email_enviado: true,
    metadata: payload.metadata || {},
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const expectedToken = Deno.env.get('INGEST_WEBHOOK_TOKEN');
  const authHeader = req.headers.get('authorization') || '';
  const providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!expectedToken || providedToken !== expectedToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = (await req.json()) as IncomingPayload;
    const registro = normalizarPayload(payload);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const query = supabase
      .from('rechazos_pacientes')
      .upsert(registro, registro.gmail_message_id ? { onConflict: 'gmail_message_id' } : undefined)
      .select('id')
      .single();

    const { data, error } = await query;

    if (error) {
      console.error('Error insertando rechazo:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: data?.id ?? null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error procesando webhook:', error);
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});