-- Script para eliminar registros duplicados de ocupacion_habitaciones
-- Mantiene solo el registro más reciente por habitación y fecha

-- Paso 1: Identificar y eliminar duplicados manteniendo el más reciente
DELETE FROM ocupacion_habitaciones 
WHERE id NOT IN (
    SELECT DISTINCT ON (habitacion_id, fecha) id
    FROM ocupacion_habitaciones
    ORDER BY habitacion_id, fecha, actualizado_en DESC, created_at DESC
);

-- Paso 2: Verificar cuántos registros quedan
SELECT COUNT(*) as total_registros, 
       COUNT(DISTINCT habitacion_id) as habitaciones_unicas,
       COUNT(DISTINCT habitacion_id || '-' || fecha) as registros_unicos_por_fecha
FROM ocupacion_habitaciones;

-- Paso 3: Verificar cuántos OTROS quedan
SELECT COUNT(*) as otros_registros,
       COUNT(DISTINCT habitacion_id) as otros_unicos
FROM ocupacion_habitaciones 
WHERE tipo_habitacion = 'otros';

-- Paso 4: Mostrar habitaciones OTROS únicas que deberían quedar
SELECT DISTINCT 
    h.nombre as nombre_habitacion,
    p.nombre_piso,
    o.tipo_habitacion,
    o.observaciones,
    o.fecha,
    o.actualizado_en
FROM ocupacion_habitaciones o
JOIN habitaciones_especiales h ON o.habitacion_id = h.id
JOIN pisos p ON h.piso_id = p.id
WHERE o.tipo_habitacion = 'otros'
ORDER BY p.nombre_piso, h.nombre;
