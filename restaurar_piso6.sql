-- Script específico para restaurar PISO 6 que no fue actualizado
-- Usamos INSERT porque no existen registros para estas habitaciones

-- Paso 1: Verificar qué habitaciones de PISO 6 existen y tienen registros
SELECT 
    h.nombre,
    h.id as habitacion_id,
    CASE WHEN o.id IS NOT NULL THEN 'TIENE_REGISTRO' ELSE 'SIN_REGISTRO' END as estado,
    COALESCE(o.tipo_habitacion, 'SIN_DATOS') as tipo_actual
FROM habitaciones_especiales h
JOIN pisos p ON h.piso_id = p.id
LEFT JOIN ocupacion_habitaciones o ON h.id = o.habitacion_id AND o.fecha = CURRENT_DATE
WHERE p.nombre_piso = 'PISO 6'
AND h.nombre IN (
    '631', '629', '601', '633', '635', '636', '634', '632', '630', '628',
    '626', '627', '625', '623', '622', '621', '620', '616', '612', '610',
    '608', '606', '604', '602'
)
ORDER BY h.nombre;

-- Paso 2: Insertar registros OTROS para habitaciones que no tienen registro
INSERT INTO ocupacion_habitaciones (habitacion_id, fecha, tipo_habitacion, total_camas, camas_ocupadas, observaciones, actualizado_en)
SELECT 
    h.id as habitacion_id,
    CURRENT_DATE as fecha,
    'otros' as tipo_habitacion,
    1 as total_camas,
    0 as camas_ocupadas,
    'Para activar' as observaciones,
    NOW() as actualizado_en
FROM habitaciones_especiales h
JOIN pisos p ON h.piso_id = p.id
WHERE p.nombre_piso = 'PISO 6'
AND h.nombre IN (
    '631', '629', '601', '633', '635', '636', '634', '632', '630', '628',
    '626', '627', '625', '623', '622', '621', '620', '616', '612', '610',
    '608', '606', '604', '602'
)
AND NOT EXISTS (
    SELECT 1 FROM ocupacion_habitaciones o 
    WHERE o.habitacion_id = h.id 
    AND o.fecha = CURRENT_DATE
);

-- Paso 3: Actualizar registros existentes que no son OTROS
UPDATE ocupacion_habitaciones 
SET 
    tipo_habitacion = 'otros',
    total_camas = 1,
    camas_ocupadas = 0,
    observaciones = 'Para activar',
    actualizado_en = NOW()
WHERE habitacion_id IN (
    SELECT h.id
    FROM habitaciones_especiales h
    JOIN pisos p ON h.piso_id = p.id
    WHERE p.nombre_piso = 'PISO 6'
    AND h.nombre IN (
        '631', '629', '601', '633', '635', '636', '634', '632', '630', '628',
        '626', '627', '625', '623', '622', '621', '620', '616', '612', '610',
        '608', '606', '604', '602'
    )
)
AND fecha = CURRENT_DATE
AND tipo_habitacion != 'otros';

-- Paso 4: Verificar resultados finales para PISO 6
SELECT 
    'PISO 6 FINAL' as piso,
    COUNT(*) as total_habitaciones,
    COUNT(CASE WHEN o.tipo_habitacion = 'activa' THEN 1 END) as internacion,
    COUNT(CASE WHEN o.tipo_habitacion = 'reparacion' THEN 1 END) as reparacion,
    COUNT(CASE WHEN o.tipo_habitacion = 'otros' THEN 1 END) as otros
FROM ocupacion_habitaciones o
JOIN habitaciones_especiales h ON o.habitacion_id = h.id
JOIN pisos p ON h.piso_id = p.id
WHERE p.nombre_piso = 'PISO 6'
AND o.fecha = CURRENT_DATE;
