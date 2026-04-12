# Gmail + Supabase

## 1. Crear la tabla en Supabase

Ejecuta este SQL en el `SQL Editor` de Supabase:

```sql
create extension if not exists pgcrypto;

create table if not exists public.rechazos_pacientes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  fecha_rechazo timestamptz,
  gmail_message_id text unique,
  remitente_email text,
  asunto_email text,
  cuerpo_email text,
  paciente_nombre text,
  paciente_apellido text,
  responsable_mi text,
  obra_social text,
  motivo text,
  diagnostico text,
  origen text not null default 'gmail',
  email_enviado boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_rechazos_created_at
  on public.rechazos_pacientes (created_at desc);

create index if not exists idx_rechazos_paciente
  on public.rechazos_pacientes (paciente_apellido, paciente_nombre);

alter table public.rechazos_pacientes enable row level security;

drop policy if exists rechazos_select_anon on public.rechazos_pacientes;

create policy rechazos_select_anon
on public.rechazos_pacientes
for select
to anon, authenticated
using (true);
```

## 2. Crear la Edge Function

Archivo listo en:

- `supabase/functions/ingest-gmail-rechazos/index.ts`

Configura estos secretos en Supabase:

- `INGEST_WEBHOOK_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`

Luego despliega la función:

```bash
supabase functions deploy ingest-gmail-rechazos
```

Si usas `supabase link`, la URL quedará similar a:

```text
https://TU-PROYECTO.supabase.co/functions/v1/ingest-gmail-rechazos
```

## 3. Configurar Gmail con Apps Script

Archivo listo en:

- `scripts/gmailRechazos.gs`

Pasos:

1. En Gmail crea la etiqueta `rechazos-hotel`.
2. Crea un filtro para que los mails de rechazo entren con esa etiqueta.
3. Ve a `script.google.com` y crea un proyecto.
4. Copia el contenido de `scripts/gmailRechazos.gs`.
5. Reemplaza:
   - `PEGAR_URL_EDGE_FUNCTION_AQUI`
   - `PEGAR_TOKEN_AQUI`
6. Ejecuta manualmente `procesarRechazosGmail` una vez para autorizar Gmail y UrlFetch.
7. Crea un trigger de tiempo:
   - cada 5 minutos o cada 10 minutos.

## 4. Formato esperado del mail

Ejemplo soportado:

```text
Paciente: ARCE GERARDO, Responsable M.I: VALLEJOS, OOSS: FUSANA, MOTIVO: , Diagnostico: SEPSIS IR DIALISIS
```

El parser intenta extraer:

- `Paciente`
- `Responsable M.I`
- `OOSS`
- `Motivo`
- `Diagnostico` o `Diagnóstico`

## 5. Qué ya muestra la app

Los dashboards de admin y visualizador ya consumen `rechazos_pacientes` y muestran:

- paciente
- obra social
- causa/motivo
- responsable M.I.
- diagnóstico
- contador de no leídos

## 6. Recomendación de seguridad

- No pongas `service_role` en React.
- El único lugar con permisos de escritura debe ser la Edge Function.
- Usa un token largo en `INGEST_WEBHOOK_TOKEN`.