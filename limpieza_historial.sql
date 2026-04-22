-- Script completo para limpiar duplicados y establecer histórico de 7 días
-- Este script resuelve el problema de habitaciones que cambian de estado día a día

-- Paso 1: Eliminar duplicados manteniendo solo el registro más reciente por habitación y fecha
DELETE FROM ocupacion_habitaciones 
WHERE id NOT IN (
    SELECT DISTINCT ON (habitacion_id, fecha) id
    FROM ocupacion_habitaciones
    ORDER BY habitacion_id, fecha, actualizado_en DESC
);

-- Paso 2: Limpiar registros antiguos (más de 7 días) para mantener solo el histórico reciente
DELETE FROM ocupacion_habitaciones 
WHERE fecha < CURRENT_DATE - INTERVAL '7 days';

-- Paso 3: Verificar resultados después de la limpieza
SELECT 
    'RESUMEN FINAL' as tipo,
    COUNT(*) as total_registros,
    COUNT(DISTINCT habitacion_id) as habitaciones_unicas,
    COUNT(DISTINCT habitacion_id || '-' || fecha) as registros_unicos_por_fecha
FROM ocupacion_habitaciones

UNION ALL

SELECT 
    'OTROS ACTUALES' as tipo,
    COUNT(*) as total_registros,
    COUNT(DISTINCT habitacion_id) as habitaciones_unicas,
    COUNT(DISTINCT habitacion_id || '-' || fecha) as registros_unicos_por_fecha
FROM ocupacion_habitaciones 
WHERE tipo_habitacion = 'otros' AND fecha = CURRENT_DATE

UNION ALL

SELECT 
    'INTERNACIÓN ACTUAL' as tipo,
    COUNT(*) as total_registros,
    COUNT(DISTINCT habitacion_id) as habitaciones_unicas,
    COUNT(DISTINCT habitacion_id || '-' || fecha) as registros_unicos_por_fecha
FROM ocupacion_habitaciones 
WHERE tipo_habitacion = 'activa' AND fecha = CURRENT_DATE

UNION ALL

SELECT 
    'REPARACIÓN ACTUAL' as tipo,
    COUNT(*) as total_registros,
    COUNT(DISTINCT habitacion_id) as habitaciones_unicas,
    COUNT(DISTINCT habitacion_id || '-' || fecha) as registros_unicos_por_fecha
FROM ocupacion_habitaciones 
WHERE tipo_habitacion = 'reparacion' AND fecha = CURRENT_DATE;

-- Paso 4: Mostrar distribución por piso para el día actual
SELECT 
    p.nombre_piso,
    COUNT(*) as total_habitaciones,
    COUNT(CASE WHEN o.tipo_habitacion = 'activa' THEN 1 END) as internacion,
    COUNT(CASE WHEN o.tipo_habitacion = 'reparacion' THEN 1 END) as reparacion,
    COUNT(CASE WHEN o.tipo_habitacion = 'otros' THEN 1 END) as otros
FROM ocupacion_habitaciones o
JOIN habitaciones_especiales h ON o.habitacion_id = h.id
JOIN pisos p ON h.piso_id = p.id
WHERE o.fecha = CURRENT_DATE
GROUP BY p.nombre_piso
ORDER BY p.nombre_piso;

-- Paso 5: Verificar que no haya duplicados por habitación/fecha
SELECT 
    habitacion_id,
    fecha,
    COUNT(*) as duplicados,
    STRING_AGG(id::text, ', ') as ids_duplicados
FROM ocupacion_habitaciones
GROUP BY habitacion_id, fecha
HAVING COUNT(*) > 1;
