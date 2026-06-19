-- Tabla de semáforos de limpieza
CREATE TABLE IF NOT EXISTS semaforos (
  id BIGSERIAL PRIMARY KEY,
  piso_id UUID NOT NULL REFERENCES pisos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tiempo_verde_min INTEGER NOT NULL DEFAULT 15,
  tiempo_rojo_min INTEGER NOT NULL DEFAULT 30,
  qr_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ultimo_escaneo_at TIMESTAMPTZ NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla de coordenadas de semáforos en el croquis
CREATE TABLE IF NOT EXISTS semaforo_coordenadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  semaforo_id BIGINT NOT NULL REFERENCES semaforos(id) ON DELETE CASCADE,
  croquis_id UUID NOT NULL REFERENCES croquis_pisos(id) ON DELETE CASCADE,
  x NUMERIC NOT NULL,
  y NUMERIC NOT NULL,
  UNIQUE(semaforo_id, croquis_id)
);

-- Historial de escaneos QR
CREATE TABLE IF NOT EXISTS semaforo_escaneos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  semaforo_id BIGINT NOT NULL REFERENCES semaforos(id) ON DELETE CASCADE,
  escaneado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  escaneado_por TEXT NULL
);

-- RLS
ALTER TABLE semaforos ENABLE ROW LEVEL SECURITY;
ALTER TABLE semaforo_coordenadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE semaforo_escaneos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "semaforos_select" ON semaforos FOR SELECT USING (true);
CREATE POLICY "semaforos_insert" ON semaforos FOR INSERT WITH CHECK (true);
CREATE POLICY "semaforos_update" ON semaforos FOR UPDATE USING (true);
CREATE POLICY "semaforos_delete" ON semaforos FOR DELETE USING (true);

CREATE POLICY "semaforo_coords_select" ON semaforo_coordenadas FOR SELECT USING (true);
CREATE POLICY "semaforo_coords_insert" ON semaforo_coordenadas FOR INSERT WITH CHECK (true);
CREATE POLICY "semaforo_coords_update" ON semaforo_coordenadas FOR UPDATE USING (true);
CREATE POLICY "semaforo_coords_delete" ON semaforo_coordenadas FOR DELETE USING (true);

CREATE POLICY "semaforo_escaneos_select" ON semaforo_escaneos FOR SELECT USING (true);
CREATE POLICY "semaforo_escaneos_insert" ON semaforo_escaneos FOR INSERT WITH CHECK (true);
