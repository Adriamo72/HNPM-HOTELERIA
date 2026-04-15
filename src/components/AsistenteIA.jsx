// components/AsistenteIA.jsx - Versión limpia y simple
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// ==================== Funciones auxiliares ====================
const norm = (str) => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const extraerNumeroPiso = (texto) => {
  const n = norm(texto);
  const match = n.match(/(\d+)/);
  if (match) return parseInt(match[1]);

  const ordinales = {
    primer: 1, primero: 1, primera: 1,
    segundo: 2, segunda: 2,
    tercer: 3, tercero: 3, tercera: 3,
    cuarto: 4, cuarta: 4,
    quinto: 5, quinta: 5,
    sexto: 6, sexta: 6,
    septimo: 7, septima: 7,
    octavo: 8, octava: 8,
    noveno: 9, novena: 9,
    decimo: 10, decima: 10
  };

  for (const [palabra, num] of Object.entries(ordinales)) {
    if (new RegExp(`\\b${palabra}\\b`).test(n)) return num;
  }
  return null;
};

const encontrarPisoPorNumero = (pisos, texto) => {
  const num = extraerNumeroPiso(texto);
  if (num === null) return null;

  for (const p of pisos) {
    const pisoNum = parseInt(p.nombre_piso.replace(/\D/g, '')) || 0;
    if (pisoNum === num) return p;
  }
  return null;
};

const calcularStats = (ocupaciones) => {
  let total = 0, ocupadas = 0, ocupadasReales = 0, aislamiento = 0;

  ocupaciones.forEach(o => {
    if (o && o.tipo_habitacion === 'activa') {
      const totalCamas = o.total_camas || 0;
      total += totalCamas;

      const camasOcupadas = Math.min(totalCamas, Math.max(0, o.camas_ocupadas || 0));
      ocupadasReales += camasOcupadas;

      // Calcular camas bloqueadas por aislamiento
      if (o.observaciones && String(o.observaciones).toUpperCase().includes('AISLAMIENTO') && camasOcupadas > 0 && totalCamas > 0) {
        const bloqueadas = Math.max(0, totalCamas - camasOcupadas);
        aislamiento += bloqueadas;
      }
    }
  });

  ocupadas = ocupadasReales + aislamiento;
  const libres = Math.max(0, total - ocupadas);
  const pct = total > 0 ? ((ocupadas / total) * 100).toFixed(1) : '0.0';

  return { total, ocupadas, libres, pct, ocupadasReales, aislamiento };
};

// ==================== Motor de respuestas ====================
function responder(texto, { pisos, habitaciones, ocupacion }) {
  if (!pisos.length || !habitaciones.length) {
    return 'Todavía estoy cargando los datos. Intentá en un momento.';
  }

  const n = norm(texto);

  // Detectar si menciona un piso
  const piso = encontrarPisoPorNumero(pisos, texto);
  const mencionaPiso = /piso|sector|planta/.test(n) && piso;

  // Filtrar habitaciones por piso si se menciona
  const habs = piso
    ? habitaciones.filter(h => String(h.piso_id) === String(piso.id))
    : habitaciones;

  const getOcup = (h) => ocupacion[h.id];
  const label = piso ? `en **${piso.nombre_piso}**` : 'en todo el hospital';
  const labelInicio = piso ? `**${piso.nombre_piso}**` : '**Todo el hospital**';

  // Habitaciones activas
  if (/habitaci[oó]n|habitaciones/.test(n) && /activa|paciente/.test(n)) {
    const count = habs.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} activa${count !== 1 ? 's' : ''} con pacientes.`;
  }

  // Camas totales
  if (/cama/.test(n)) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    if (!stats || stats.total === 0) {
      return `No hay camas activas ${label}.`;
    }
    return `${labelInicio} hay **${stats.total}** camas en habitaciones activas (${stats.ocupadas} ocupadas, ${stats.libres} libres, **${stats.pct}%** de ocupación).`;
  }

  // Pacientes
  if (/paciente|pacientes/.test(n)) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    if (!stats || stats.total === 0) {
      return `No hay pacientes ${label}.`;
    }
    return `${labelInicio} hay **${stats.ocupadasReales}** paciente${stats.ocupadasReales !== 1 ? 's' : ''} internado${stats.ocupadasReales !== 1 ? 's' : ''} de ${stats.total} camas totales.`;
  }

  // Total habitaciones
  if (/habitaci[oó]n|habitaciones/.test(n)) {
    return `${labelInicio} hay **${habs.length}** habitación${habs.length !== 1 ? 'es' : ''} en total.`;
  }

  // Resumen general
  if (/resumen|estadistica|estad[ií]sticas|como est[aá]|general/.test(n)) {
    const scope = habs;
    const enReparacion = scope.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion').length;
    const enOtros = scope.filter(h => getOcup(h)?.tipo_habitacion === 'otros').length;
    const activas = scope.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
    const sinDatos = scope.filter(h => !getOcup(h)).length;
    const { total, ocupadas, libres, pct, aislamiento } = calcularStats(scope.map(h => getOcup(h)).filter(Boolean));
    const disponiblesReales = libres - aislamiento;
    return (
      `${labelInicio} — Resumen:\n` +
      `• **${scope.length}** habitaciones en total\n` +
      `• **${activas}** activas con pacientes\n` +
      `• **${enReparacion}** en reparación\n` +
      `• **${enOtros}** en estado "Otros"\n` +
      `• **${sinDatos}** sin datos de hoy\n` +
      `• **${pct}%** de ocupación (${ocupadas}/${total} camas, ${libres} libres, ${aislamiento} bloqueadas por aislamiento, ${disponiblesReales} realmente disponibles)`
    );
  }

  return 'No entendí la pregunta. Podés preguntarme por ejemplo:\n• ¿Cuántas habitaciones hay en el 6to piso?\n• ¿Cuántas camas libres hay?\n• ¿Cuál es el porcentaje de ocupación?\n• Resumen general del hospital';
}

// ==================== Componente principal ====================
const AsistenteIA = ({ pisos }) => {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [habitaciones, setHabitaciones] = useState([]);
  const [ocupacion, setOcupacion] = useState({});
  const [datosListos, setDatosListos] = useState(false);
  const mensajesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Cargar datos al abrir
  useEffect(() => {
    if (abierto && habitaciones.length === 0) {
      cargarDatos();
    }
  }, [abierto]);

  const cargarDatos = async () => {
    try {
      setCargando(true);

      // Cargar habitaciones
      const { data: habitacionesData, error: habError } = await supabase
        .from('habitaciones_especiales')
        .select('id, piso_id, nombre');

      if (habError) throw habError;
      setHabitaciones(habitacionesData || []);

      // Cargar ocupación
      if (habitacionesData && habitacionesData.length > 0) {
        const ids = habitacionesData.map(h => h.id);

        const { data: ocupacionData } = await supabase
          .from('ocupacion_habitaciones')
          .select('habitacion_id, tipo_habitacion, camas_ocupadas, total_camas, fecha, actualizado_en, informacion_ampliatoria, observaciones')
          .in('habitacion_id', ids)
          .order('fecha', { ascending: false })
          .order('actualizado_en', { ascending: false });

        // Tomar el registro más reciente por habitación
        const ocupMap = {};
        (ocupacionData || []).forEach(occ => {
          if (!ocupMap[occ.habitacion_id]) {
            ocupMap[occ.habitacion_id] = occ;
          }
        });

        setOcupacion(ocupMap);
      }

      setDatosListos(true);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setCargando(false);
    }
  };

  const enviarPregunta = (texto) => {
    const textoInput = texto || input;
    if (!textoInput.trim()) return;

    const pregunta = { tipo: 'user', texto: textoInput };
    setMensajes(prev => [...prev, pregunta]);
    setInput('');

    if (cargando) {
      setMensajes(prev => [...prev, { tipo: 'bot', texto: 'Cargando datos, esperá un momento...' }]);
      return;
    }

    const respuesta = responder(textoInput, { pisos, habitaciones, ocupacion });
    setMensajes(prev => [...prev, { tipo: 'bot', texto: respuesta }]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarPregunta();
    }
  };

  // Auto-scroll
  useEffect(() => {
    mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  // Focus input al abrir
  useEffect(() => {
    if (abierto) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [abierto]);

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
              onClick={cargarDatos}
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
                  className={`max-w-[85%] px-3 py-2 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                    msg.tipo === 'user'
                      ? 'bg-green-600 text-white rounded-br-sm'
                      : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                  }`}
                >
                  {msg.texto.split('**').map((part, i) =>
                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                  )}
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
              {['Resumen general', '¿Cuántas habitaciones hay en el 6to piso?', '¿Cuántas camas libres hay?', '¿Cuál es el porcentaje de ocupación?'].map((s, i) => (
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
