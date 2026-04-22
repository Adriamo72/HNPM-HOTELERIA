-- Script para restaurar habitaciones OTROS que fueron eliminadas incorrectamente
-- Necesitamos recrear los registros OTROS para las habitaciones que deberían ser OTROS

-- Paso 1: Identificar habitaciones que deberían ser OTROS según los croquis
-- Estas son las habitaciones que visualmente aparecen como grises en los planos

-- Actualizar registros OTROS para PISO 6 (habitaciones que deberían ser OTROS)
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
AND fecha = CURRENT_DATE;

-- Actualizar registros OTROS para PISO 5
UPDATE ocupacion_habitaciones 
SET 
    tipo_habitacion = 'otros',
    total_camas = 1,
    camas_ocupadas = 0,
    observaciones = CASE 
        WHEN h.nombre IN ('528', '536', '534', '532', '530', '526', '524', '522') THEN 'NEFROLOGÍA'
        WHEN h.nombre = '520' THEN 'Pañol de Traumatología'
        WHEN h.nombre = '506' THEN 'Recuperación Quirurgica (Falta Personal)'
        WHEN h.nombre = '535' THEN 'Enfermeria Provisoria'
        ELSE 'Para activar'
    END,
    actualizado_en = NOW()
FROM habitaciones_especiales h
JOIN pisos p ON h.piso_id = p.id
WHERE ocupacion_habitaciones.habitacion_id = h.id
AND p.nombre_piso = 'PISO 5'
AND h.nombre IN ('528', '536', '534', '532', '530', '526', '524', '522', '520', '506', '535')
AND ocupacion_habitaciones.fecha = CURRENT_DATE;

-- Actualizar registros OTROS para PISO 4
UPDATE ocupacion_habitaciones 
SET 
    tipo_habitacion = 'otros',
    total_camas = 1,
    camas_ocupadas = 0,
    observaciones = CASE 
        WHEN h.nombre IN ('428', '426', '424', '422', '420') THEN 'NEFROLOGÍA'
        ELSE 'Para activar'
    END,
    actualizado_en = NOW()
FROM habitaciones_especiales h
JOIN pisos p ON h.piso_id = p.id
WHERE ocupacion_habitaciones.habitacion_id = h.id
AND p.nombre_piso = 'PISO 4'
AND h.nombre IN ('428', '426', '424', '422', '420')
AND ocupacion_habitaciones.fecha = CURRENT_DATE;

-- Actualizar registros OTROS para PISO 3
UPDATE ocupacion_habitaciones 
SET 
    tipo_habitacion = 'otros',
    total_camas = 1,
    camas_ocupadas = 0,
    observaciones = CASE 
        WHEN h.nombre IN ('328', '326', '324', '322', '320', '318', '316', '314', '312', '310') THEN 'NEFROLOGÍA'
        ELSE 'Para activar'
    END,
    actualizado_en = NOW()
FROM habitaciones_especiales h
JOIN pisos p ON h.piso_id = p.id
WHERE ocupacion_habitaciones.habitacion_id = h.id
AND p.nombre_piso = 'PISO 3'
AND h.nombre IN ('328', '326', '324', '322', '320', '318', '316', '314', '312', '310')
AND ocupacion_habitaciones.fecha = CURRENT_DATE;

-- Paso 2: Verificar resultados después de la restauración
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

-- Paso 3: Verificar total de OTROS restaurados
SELECT 
    COUNT(*) as total_otros_restaurados,
    COUNT(DISTINCT h.piso_id) as pisos_con_otros,
    STRING_AGG(DISTINCT p.nombre_piso, ', ') as pisos_afectados
FROM ocupacion_habitaciones o
JOIN habitaciones_especiales h ON o.habitacion_id = h.id
JOIN pisos p ON h.piso_id = p.id
WHERE o.fecha = CURRENT_DATE
AND o.tipo_habitacion = 'otros';
