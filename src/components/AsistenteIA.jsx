// components/AsistenteIA.jsx
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// ==================== Normalización ====================
const norm = (str) =>
  (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ==================== Stop words (no se usan para matching) ====================
const STOP_WORDS = new Set(['piso', 'sector', 'planta', 'sala', 'area', 'unidad',
  'hospital', 'gral', 'general', 'los', 'las', 'del', 'de', 'en', 'el', 'la', 'hay',
]);

// ==================== Ordinales en español ====================
const ORDINALES = {
  primer: 1, primero: 1, primera: 1,
  segundo: 2, segunda: 2,
  tercer: 3, tercero: 3, tercera: 3,
  cuarto: 4, cuarta: 4,
  quinto: 5, quinta: 5,
  sexto: 6, sexta: 6,
  septimo: 7, septima: 7,
  octavo: 8, octava: 8,
  noveno: 9, novena: 9,
  decimo: 10, decima: 10,
};

// ==================== Extraer número de piso ====================
function extraerNumeroPiso(texto) {
  const n = norm(texto);
  const match = n.match(/(\d+)/);
  if (match) return parseInt(match[1]);
  for (const [palabra, num] of Object.entries(ORDINALES)) {
    if (new RegExp(`\\b${palabra}\\b`).test(n)) return num;
  }
  return null;
}

// ==================== Encontrar piso por número ====================
function encontrarPisoPorNumero(pisos, n) {
  const num = extraerNumeroPiso(n);
  if (num === null) return null;
  for (const p of pisos) {
    const pisoNum = parseInt(p.nombre_piso.replace(/\D/g, '')) || 0;
    if (pisoNum === num) return p;
  }
  return null;
}

// ==================== Obtener servicios únicos de ocupación ====================
function getServiciosUnicos(ocupacion) {
  const set = new Set();
  for (const occ of Object.values(ocupacion)) {
    if (occ.informacion_ampliatoria) set.add(occ.informacion_ampliatoria);
  }
  return [...set];
}

// ==================== Encontrar servicios que coinciden con la query ====================
// Estrategia en 2 pasos: primero exact, luego word-match
function encontrarServicios(n, serviciosDisponibles) {
  // Paso 1: exact include (ej. query contiene "clinica i" → matchea "Clínica I")
  const exactas = serviciosDisponibles.filter(srv => n.includes(norm(srv)));
  if (exactas.length > 0) return exactas;

  // Paso 2: todas las palabras significativas del servicio aparecen en la query
  const todas = serviciosDisponibles.filter(srv => {
    const ns = norm(srv);
    const palabras = ns.split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
    return palabras.length > 0 && palabras.every(w => n.includes(w));
  });
  if (todas.length > 0) return todas;

  // Paso 3: al menos una palabra significativa larga
  return serviciosDisponibles.filter(srv => {
    const ns = norm(srv);
    const palabras = ns.split(/\s+/).filter(w => w.length > 4 && !STOP_WORDS.has(w));
    return palabras.length > 0 && palabras.some(w => n.includes(w));
  });
}

// ==================== Obtener ocupaciones filtradas por lista de servicios ====================
function getOcupPorServicios(servicios, ocupacion) {
  const normSet = new Set(servicios.map(s => norm(s)));
  return Object.values(ocupacion).filter(o =>
    o.informacion_ampliatoria && normSet.has(norm(o.informacion_ampliatoria))
  );
}

// ==================== Funciones de cálculo de camas (igual que sistema principal) ====================
const getCamasOcupadasReales = (ocup) => {
  const totalCamas = ocup?.total_camas || 0;
  const camasOcupadas = ocup?.camas_ocupadas || 0;
  return Math.min(totalCamas, Math.max(0, camasOcupadas));
};

const esAislamientoPatologia = (observaciones) =>
  String(observaciones || '').toUpperCase().includes('AISLAMIENTO');

const getCamasNoUtilizadasPorAislamiento = (ocup) => {
  const totalCamas = ocup?.total_camas || 0;
  const camasOcupadasReales = getCamasOcupadasReales(ocup);
  const aislamientoActivo = esAislamientoPatologia(ocup?.observaciones);

  if (!aislamientoActivo || camasOcupadasReales <= 0 || totalCamas <= 0) {
    return 0;
  }

  return Math.max(0, totalCamas - camasOcupadasReales);
};

// ==================== Calcular stats de una lista de ocupaciones (actualizado) ====================
function calcularStats(ocuList) {
  let total = 0, ocupadas = 0, ocupadasReales = 0, aislamiento = 0;
  console.log('🏥 AsistenteIA - calcularStats - ocuList length:', ocuList.length);
  
  ocuList.forEach(o => {
    if (o && o.tipo_habitacion === 'activa') {
      const totalCamas = parseInt(o.total_camas) || 0;
      total += totalCamas;
      ocupadasReales += getCamasOcupadasReales(o);
      aislamiento += getCamasNoUtilizadasPorAislamiento(o);
    }
  });
  ocupadas = ocupadasReales + aislamiento; // Ocupación práctica
  const libres = Math.max(0, total - ocupadas);
  const pct = total > 0 ? ((ocupadas / total) * 100).toFixed(1) : '0.0';
  
  console.log('🏥 AsistenteIA - calcularStats result:', {
    total,
    ocupadas,
    libres,
    pct,
    ocupadasReales,
    aislamiento
  });
  
  return { total, ocupadas, libres, pct, ocupadasReales, aislamiento };
}

// ==================== Motor de respuestas ====================
function responder(texto, { pisos, habitaciones, ocupacion }) {
  if (!pisos.length || !habitaciones.length) {
    return 'Todavía estoy cargando los datos. Intentá en un momento.';
  }

  const n = norm(texto);
  const serviciosDisponibles = getServiciosUnicos(ocupacion);
  const serviciosMatch = encontrarServicios(n, serviciosDisponibles);
  const piso = encontrarPisoPorNumero(pisos, n);
  const mencionaPiso = /piso|sector|planta/.test(n) && piso;

  // =========================================================
  // SCOPE: SERVICIO (tiene prioridad si no se menciona piso)
  // =========================================================
  if (serviciosMatch.length > 0 && !mencionaPiso) {
    const ocuServicio = getOcupPorServicios(serviciosMatch, ocupacion);
    const labelServicio = serviciosMatch.length === 1
      ? `**${serviciosMatch[0]}**`
      : `**${serviciosMatch.join(' + ')}**`;

    // ¿En qué piso está X?
    if (/en qu[eé] piso|qu[eé] sector|d[oó]nde|donde queda|a qu[eé] piso/.test(n)) {
      const habIds = new Set(ocuServicio.map(o => o.habitacion_id));
      const pisoIds = [...new Set(
        habitaciones.filter(h => habIds.has(h.id)).map(h => h.piso_id)
      )];
      const pisosEncontrados = pisoIds.map(pid => pisos.find(p => p.id === pid)).filter(Boolean);
      if (!pisosEncontrados.length) return `No encontré datos de ubicación para ${labelServicio}.`;
      const nombresPisos = pisosEncontrados.map(p => p.nombre_piso).join(' y ');
      return `${labelServicio} se encuentra en **${nombresPisos}**.`;
    }

    // ¿Cuáles son las habitaciones de X?
    if (/cu[aá]les? son|qu[eé] habitaciones|listado de hab/.test(n)) {
      const habIds = new Set(ocuServicio.map(o => o.habitacion_id));
      const habsDelServicio = habitaciones.filter(h => habIds.has(h.id));
      if (!habsDelServicio.length) return `No encontré habitaciones registradas para ${labelServicio}.`;
      const nombres = habsDelServicio.map(h => h.nombre).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ');
      return `Las habitaciones de ${labelServicio} son:\n${nombres}`;
    }

    // Reparación
    if (/reparaci[oó]n/.test(n)) {
      const count = ocuServicio.filter(o => o.tipo_habitacion === 'reparacion').length;
      return `${labelServicio} tiene **${count}** habitación${count !== 1 ? 'es' : ''} en reparación.`;
    }

    // Camas libres
    if (/cama/.test(n) && /libre|disponible/.test(n)) {
      const { total, ocupadas, libres } = calcularStats(ocuServicio);
      return `${labelServicio} tiene **${libres}** cama${libres !== 1 ? 's' : ''} libre${libres !== 1 ? 's' : ''} (${ocupadas} ocupadas de ${total} totales).`;
    }

    // Camas ocupadas
    if (/cama/.test(n) && /ocupad|usad/.test(n)) {
      const { total, ocupadas } = calcularStats(ocuServicio);
      return `${labelServicio} tiene **${ocupadas}** cama${ocupadas !== 1 ? 's' : ''} ocupada${ocupadas !== 1 ? 's' : ''} de ${total} totales.`;
    }

    // Camas totales / cuántas camas tiene
    if (/cama/.test(n)) {
      const { total, ocupadas, libres, pct } = calcularStats(ocuServicio);
      return `${labelServicio} tiene **${total}** camas en total (${ocupadas} ocupadas, ${libres} libres, **${pct}%** de ocupación).`;
    }

    // Porcentaje
    if (/porcentaje|%|ocupaci[oó]n/.test(n)) {
      const { total, ocupadas, pct } = calcularStats(ocuServicio);
      return `El porcentaje de ocupación de ${labelServicio} es **${pct}%** (${ocupadas}/${total} camas).`;
    }

    // Habitaciones activas
    if (/habitaci[oó]n|habitaciones/.test(n) && /activa|paciente/.test(n)) {
      const count = ocuServicio.filter(o => o.tipo_habitacion === 'activa').length;
      return `${labelServicio} tiene **${count}** habitación${count !== 1 ? 'es' : ''} activa${count !== 1 ? 's' : ''} con pacientes.`;
    }

    // Total habitaciones
    if (/habitaci[oó]n|habitaciones/.test(n)) {
      const habIds = new Set(ocuServicio.map(o => o.habitacion_id));
      const count = habitaciones.filter(h => habIds.has(h.id)).length;
      return `${labelServicio} tiene **${count}** habitación${count !== 1 ? 'es' : ''} registradas.`;
    }

    // Resumen del servicio (default cuando se menciona servicio sin más detalle)
    {
      const { total, ocupadas, libres, pct } = calcularStats(ocuServicio);
      const habIds = new Set(ocuServicio.map(o => o.habitacion_id));
      const pisoIds = [...new Set(
        habitaciones.filter(h => habIds.has(h.id)).map(h => h.piso_id)
      )];
      const pisosEncontrados = pisoIds.map(pid => pisos.find(p => p.id === pid)).filter(Boolean);
      const nombresPisos = pisosEncontrados.map(p => p.nombre_piso).join(', ');
      const enRep = ocuServicio.filter(o => o.tipo_habitacion === 'reparacion').length;
      return (
        `${labelServicio}${nombresPisos ? ` (${nombresPisos})` : ''}\n` +
        `• **${total}** camas totales\n` +
        `• **${ocupadas}** ocupadas — **${libres}** libres\n` +
        `• **${pct}%** de ocupación` +
        (enRep > 0 ? `\n• **${enRep}** en reparación` : '')
      );
    }
  }

  // =========================================================
  // SCOPE: PISO o TODO EL HOSPITAL
  // =========================================================
  const habs = piso
    ? habitaciones.filter(h => String(h.piso_id) === String(piso.id))
    : habitaciones;
  const label = piso ? `en **${piso.nombre_piso}**` : 'en todo el hospital';
  const labelInicio = piso ? `**${piso.nombre_piso}**` : '**Todo el hospital**';
  const getOcup = (h) => ocupacion[h.id];

  // ¿En qué piso está X? (sin servicio identificado)
  if (/en qu[eé] piso|qu[eé] sector|d[oó]nde/.test(n)) {
    const lista = pisos.map(p => p.nombre_piso).join(', ');
    return `No identifiqué el servicio que buscás. Los sectores disponibles son: ${lista}.`;
  }

  // ¿Cuáles son las habitaciones de X?
  if (/cu[aá]les? son.*habitaci|habitaciones? de|listado de hab/.test(n)) {
    if (piso) {
      if (!habs.length) return `No hay habitaciones registradas en **${piso.nombre_piso}**.`;
      const nombres = habs.map(h => h.nombre).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ');
      return `Las habitaciones de **${piso.nombre_piso}** son:\n${nombres}`;
    }
    return 'Especificá el servicio o piso. Por ejemplo: "¿Cuáles son las habitaciones de Recuperación?"';
  }

  // Reparación
  if (/reparaci[oó]n/.test(n)) {
    const lista = habs.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion');
    const count = lista.length;
    const nombres = lista.map(h => h.nombre).join(', ');
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} en reparación${nombres ? ` (${nombres})` : ''}.`;
  }

  // Otros
  if (/\botros?\b/.test(n) && /habitaci[oó]n|habitaciones/.test(n)) {
    const lista = habs.filter(h => getOcup(h)?.tipo_habitacion === 'otros');
    const count = lista.length;
    const nombres = lista.map(h => h.nombre).join(', ');
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} en estado "Otros"${nombres ? ` (${nombres})` : ''}.`;
  }

  // Porcentaje
  if (/porcentaje|%/.test(n) || (/ocupaci[oó]n/.test(n) && /porcentaje|%/.test(n))) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    if (stats.total === 0) {
      return `No hay camas activas ${label} para calcular porcentaje de ocupación.`;
    }
    return `El porcentaje de ocupación ${label} es del **${stats.pct}%** (${stats.ocupadas} de ${stats.total} camas ocupadas).`;
  }

  // Camas libres
  if (/cama/.test(n) && /libre|disponible/.test(n)) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    if (stats.total === 0) {
      return `No hay camas activas ${label}.`;
    }
    return `${labelInicio} hay **${stats.libres}** cama${stats.libres !== 1 ? 's' : ''} libre${stats.libres !== 1 ? 's' : ''} de ${stats.total} totales.`;
  }

  // Camas ocupadas
  if (/cama/.test(n) && /ocupad|usad|llena/.test(n)) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    if (!stats || stats.total === 0) {
      return `No hay camas activas ${label}.`;
    }
    return `${labelInicio} hay **${stats.ocupadas}** cama${stats.ocupadas !== 1 ? 's' : ''} ocupada${stats.ocupadas !== 1 ? 's' : ''} de ${stats.total} totales.`;
  }

  // Camas totales
  if (/cama/.test(n)) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    if (!stats || stats.total === 0) {
      return `No hay camas activas ${label}.`;
    }
    return `${labelInicio} hay **${stats.total}** camas en habitaciones activas (${stats.ocupadas} ocupadas, ${stats.libres} libres, **${stats.pct}%** de ocupación).`;
  }

  // Habitaciones activas
  if (/habitaci[oó]n|habitaciones/.test(n) && /activa|paciente/.test(n)) {
    const count = habs.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} activa${count !== 1 ? 's' : ''} con pacientes.`;
  }

  // Habitaciones disponibles
  if (/habitaci[oó]n|habitaciones/.test(n) && /disponible|libre/.test(n)) {
    const count = habs.filter(h => {
      const o = getOcup(h);
      return !o || o.tipo_habitacion === 'disponible' || o.tipo_habitacion === null;
    }).length;
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} disponible${count !== 1 ? 's' : ''}.`;
  }

  // Total habitaciones
  if (/habitaci[oó]n|habitaciones/.test(n)) {
    return `${labelInicio} hay **${habs.length}** habitación${habs.length !== 1 ? 'es' : ''} en total.`;
  }

  // Sectores / pisos
  if (/piso|sector|planta/.test(n) && /cu[aá]ntos|listado|cu[aá]les|lista/.test(n)) {
    const lista = pisos.map(p => p.nombre_piso).join(', ');
    return `El hospital tiene **${pisos.length}** sectores: ${lista}.`;
  }

  // Servicios disponibles
  if (/servicio|especialidad|especialidades/.test(n)) {
    if (!serviciosDisponibles.length) return 'No encontré datos de servicios cargados.';
    return `Los servicios registrados son:\n${serviciosDisponibles.sort().join(', ')}`;
  }

  // Resumen general
  if (/resumen|estadistica|estad[ií]sticas|como est[aá]|general/.test(n)) {
    const scope = habs;
    const enReparacion = scope.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion').length;
    const enOtros = scope.filter(h => getOcup(h)?.tipo_habitacion === 'otros').length;
    const activas = scope.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
    const sinDatos = scope.filter(h => !getOcup(h)).length;
    const { total, ocupadas, libres, pct } = calcularStats(scope.map(h => getOcup(h)).filter(Boolean));
    return (
      `${labelInicio} — Resumen:\n` +
      `• **${scope.length}** habitaciones en total\n` +
      `• **${activas}** activas con pacientes\n` +
      `• **${enReparacion}** en reparación\n` +
      `• **${enOtros}** en estado "Otros"\n` +
      `• **${sinDatos}** sin datos de hoy\n` +
      `• **${pct}%** de ocupación (${ocupadas}/${total} camas, ${libres} libres)`
    );
  }

  return null;
}

// ==================== Formato de texto (bold) ====================
function FormatText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : part.split('\n').map((line, j) => (
              <React.Fragment key={`${i}-${j}`}>
                {j > 0 && <br />}
                {line}
              </React.Fragment>
            ))
      )}
    </span>
  );
}

// ==================== Preguntas sugeridas ====================
const SUGERENCIAS = [
  'Resumen general del hospital',
  '¿Cuántas habitaciones hay en total?',
  '¿Cuántas camas libres hay en total?',
  '¿Cuántas habitaciones están en reparación?',
  '¿Cuál es el porcentaje de ocupación?',
  '¿Cuáles son los sectores disponibles?',
  '¿En qué piso está Recuperación?',
  '¿Cuáles son las habitaciones de Pediatría?',
];

// ==================== Componente principal ====================
const AsistenteIA = ({ pisos }) => {
  const [habitacionesEspeciales, setHabitacionesEspeciales] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([
    {
      tipo: 'bot',
      texto: '¡Hola! Soy tu asistente de ocupación. Podés preguntarme sobre habitaciones, camas o porcentaje de ocupación por piso o del hospital en general.',
    },
  ]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ocupacion, setOcupacion] = useState({});
  const [datosListos, setDatosListos] = useState(false);
  const mensajesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Cargar habitaciones especiales y ocupación al abrir por primera vez
  useEffect(() => {
    if (abierto && !datosListos) {
      cargarHabitacionesEspeciales();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Cargar ocupación cuando habitaciones especiales estén listas
  useEffect(() => {
    if (habitacionesEspeciales.length > 0 && !datosListos) {
      cargarOcupacion();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitacionesEspeciales]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  // Focus input al abrir
  useEffect(() => {
    if (abierto) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [abierto]);

  const cargarHabitacionesEspeciales = async () => {
    try {
      const { data, error } = await supabase
        .from('habitaciones_especiales')
        .select('id, piso_id, nombre');
      
      if (error) throw error;
      console.log('🏥 AsistenteIA - Habitaciones especiales cargadas:', data?.length || 0);
      setHabitacionesEspeciales(data || []);
    } catch (err) {
      console.error('Error cargando habitaciones especiales:', err);
    }
  };

  const cargarOcupacion = async () => {
    try {
      setCargando(true);
      if (habitacionesEspeciales.length === 0) return;
      const ids = habitacionesEspeciales.map(h => h.id);

      const { data } = await supabase
        .from('ocupacion_habitaciones')
        .select('habitacion_id, tipo_habitacion, camas_ocupadas, total_camas, fecha, actualizado_en, informacion_ampliatoria')
        .in('habitacion_id', ids)
        .order('fecha', { ascending: false })
        .order('actualizado_en', { ascending: false });

      // Tomar el registro más reciente de hoy por habitación (o el más reciente en general)
      const ocupMap = {};
      (data || []).forEach(occ => {
        if (!ocupMap[occ.habitacion_id]) {
          ocupMap[occ.habitacion_id] = occ;
        }
      });

      console.log('🏥 AsistenteIA - Registros de ocupación:', Object.keys(ocupMap).length);
      console.log('🏥 AsistenteIA - Datos de ocupación:', ocupMap);

      setOcupacion(ocupMap);
      setDatosListos(true);
    } catch (err) {
      console.error('Error cargando ocupación para asistente:', err);
    } finally {
      setCargando(false);
    }
  };

  const enviarPregunta = (textoInput) => {
    const texto = (textoInput || input).trim();
    if (!texto) return;

    const pregunta = { tipo: 'user', texto };
    setMensajes(prev => [...prev, pregunta]);
    setInput('');

    if (cargando) {
      setMensajes(prev => [...prev, { tipo: 'bot', texto: 'Cargando datos, esperá un momento...' }]);
      return;
    }

    const respuesta = responder(texto, { pisos, habitaciones: habitacionesEspeciales, ocupacion });

    if (respuesta) {
      setMensajes(prev => [...prev, { tipo: 'bot', texto: respuesta }]);
    } else {
      setMensajes(prev => [
        ...prev,
        {
          tipo: 'bot',
          texto:
            'No entendí la pregunta. Podés preguntarme por ejemplo:\n• ¿Cuántas habitaciones hay en el 4to piso?\n• ¿Cuántas camas libres hay?\n• ¿Cuál es el porcentaje de ocupación?\n• Resumen general del hospital',
        },
      ]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarPregunta();
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-green-600 hover:bg-green-500 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title="Asistente de ocupación"
      >
        {abierto ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
          </svg>
        )}
      </button>

      {/* Panel del chat */}
      {abierto && (
        <div className="fixed bottom-24 right-4 z-50 w-[min(95vw,400px)] h-[min(80vh,520px)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-sm">🤖</div>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold">Asistente de Ocupación</p>
              <p className="text-slate-400 text-xs">
                {cargando ? 'Cargando datos...' : datosListos ? 'Listo' : 'Conectando...'}
              </p>
            </div>
            <button
              onClick={cargarOcupacion}
              title="Actualizar datos"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {mensajes.map((msg, i) => (
              <div key={i} className={`flex ${msg.tipo === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl leading-relaxed ${
                    msg.tipo === 'user'
                      ? 'bg-green-600 text-white rounded-br-sm'
                      : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                  }`}
                >
                  <FormatText text={msg.texto} />
                </div>
              </div>
            ))}
            {cargando && (
              <div className="flex justify-start">
                <div className="bg-slate-700 text-slate-400 px-3 py-2 rounded-2xl rounded-bl-sm text-xs">
                  Cargando datos de ocupación...
                </div>
              </div>
            )}
            <div ref={mensajesEndRef} />
          </div>

          {/* Sugerencias */}
          {mensajes.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1 flex-shrink-0">
              {SUGERENCIAS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => enviarPregunta(s)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-full px-3 py-1 transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 px-3 py-3 border-t border-slate-700 flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Preguntame sobre las habitaciones..."
              className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500 transition-colors"
            />
            <button
              onClick={() => enviarPregunta()}
              disabled={!input.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-3 py-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AsistenteIA;
