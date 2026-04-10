// components/AsistenteIA.jsx
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// ==================== Normalización de texto ====================
const norm = (str) =>
  (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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

function extraerNumeroPiso(texto) {
  const n = norm(texto);
  const match = n.match(/\b(\d+)\b/);
  if (match) return parseInt(match[1]);
  for (const [palabra, num] of Object.entries(ORDINALES)) {
    if (new RegExp(`\\b${palabra}\\b`).test(n)) return num;
  }
  return null;
}

function encontrarPiso(pisos, texto) {
  const n = norm(texto);
  // Intentar coincidencia exacta con el nombre del piso
  for (const p of pisos) {
    if (n.includes(norm(p.nombre_piso))) return p;
  }
  // Intentar por número
  const num = extraerNumeroPiso(texto);
  if (num !== null) {
    for (const p of pisos) {
      const pisoNum = parseInt(p.nombre_piso.replace(/\D/g, '')) || 0;
      if (pisoNum === num) return p;
    }
  }
  return null;
}

// ==================== Motor de respuestas ====================
function responder(texto, { pisos, habitaciones, ocupacion }) {
  if (!pisos.length || !habitaciones.length) {
    return 'Todavía estoy cargando los datos. Intentá en un momento.';
  }

  const n = norm(texto);
  const piso = encontrarPiso(pisos, n);
  const habs = piso
    ? habitaciones.filter(h => String(h.piso_id) === String(piso.id))
    : habitaciones;

  const label = piso ? `en **${piso.nombre_piso}**` : 'en todo el hospital';
  const labelInicio = piso ? `**${piso.nombre_piso}**` : '**Todo el hospital**';

  const getOcup = (h) => ocupacion[h.id];

  // ---- Reparación ----
  if (/reparaci[oó]n/.test(n)) {
    const lista = habs.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion');
    const count = lista.length;
    const nombres = lista.map(h => h.nombre).join(', ');
    const detalle = nombres ? ` (${nombres})` : '';
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} en reparación${detalle}.`;
  }

  // ---- Otros ----
  if (/\botros?\b/.test(n) && /habitaci[oó]n|habitaciones/.test(n)) {
    const lista = habs.filter(h => getOcup(h)?.tipo_habitacion === 'otros');
    const count = lista.length;
    const nombres = lista.map(h => h.nombre).join(', ');
    const detalle = nombres ? ` (${nombres})` : '';
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} en estado "Otros"${detalle}.`;
  }

  // ---- Porcentaje de ocupación ----
  if (/porcentaje|% de ocupaci[oó]n/.test(n) || (/ocupaci[oó]n/.test(n) && /porcentaje|%/.test(n))) {
    let totalCamas = 0, camasOcupadas = 0;
    habs.forEach(h => {
      const o = getOcup(h);
      if (o?.tipo_habitacion === 'activa') {
        totalCamas += o.total_camas || 1;
        camasOcupadas += o.camas_ocupadas || 0;
      }
    });
    const pct = totalCamas > 0 ? ((camasOcupadas / totalCamas) * 100).toFixed(1) : '0.0';
    return `El porcentaje de ocupación ${label} es del **${pct}%** (${camasOcupadas} de ${totalCamas} camas ocupadas).`;
  }

  // ---- Camas libres / disponibles ----
  if (/cama/.test(n) && /libre|disponible/.test(n)) {
    let totalCamas = 0, camasOcupadas = 0;
    habs.forEach(h => {
      const o = getOcup(h);
      if (o?.tipo_habitacion === 'activa') {
        totalCamas += o.total_camas || 1;
        camasOcupadas += o.camas_ocupadas || 0;
      }
    });
    const libres = totalCamas - camasOcupadas;
    return `${labelInicio} hay **${libres}** cama${libres !== 1 ? 's' : ''} libre${libres !== 1 ? 's' : ''} de un total de ${totalCamas}.`;
  }

  // ---- Camas ocupadas ----
  if (/cama/.test(n) && /ocupad|usad|llena/.test(n)) {
    let totalCamas = 0, camasOcupadas = 0;
    habs.forEach(h => {
      const o = getOcup(h);
      if (o?.tipo_habitacion === 'activa') {
        totalCamas += o.total_camas || 1;
        camasOcupadas += o.camas_ocupadas || 0;
      }
    });
    return `${labelInicio} hay **${camasOcupadas}** cama${camasOcupadas !== 1 ? 's' : ''} ocupada${camasOcupadas !== 1 ? 's' : ''} de un total de ${totalCamas}.`;
  }

  // ---- Total de camas ----
  if (/cuantas? cama/.test(n) || (/cama/.test(n) && /total/.test(n))) {
    let totalCamas = 0;
    habs.forEach(h => {
      const o = getOcup(h);
      if (o?.tipo_habitacion === 'activa') {
        totalCamas += o.total_camas || 1;
      }
    });
    return `${labelInicio} hay **${totalCamas}** cama${totalCamas !== 1 ? 's' : ''} en habitaciones activas.`;
  }

  // ---- Habitaciones activas / con pacientes ----
  if (/habitaci[oó]n|habitaciones/.test(n) && /activa|paciente|con camas/.test(n)) {
    const count = habs.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} activa${count !== 1 ? 's' : ''} con pacientes.`;
  }

  // ---- Habitaciones disponibles / libres ----
  if (/habitaci[oó]n|habitaciones/.test(n) && /disponible|libre/.test(n)) {
    const count = habs.filter(h => {
      const o = getOcup(h);
      return !o || o.tipo_habitacion === 'disponible';
    }).length;
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} disponible${count !== 1 ? 's' : ''}.`;
  }

  // ---- Total habitaciones ----
  if (/habitaci[oó]n|habitaciones/.test(n)) {
    const count = habs.length;
    return `${labelInicio} hay **${count}** habitación${count !== 1 ? 'es' : ''} en total.`;
  }

  // ---- Pisos disponibles ----
  if (/piso|sector|planta/.test(n) && /cuantos|listado|cuales|lista/.test(n)) {
    const lista = pisos.map(p => p.nombre_piso).join(', ');
    return `El hospital tiene **${pisos.length}** sectores/pisos: ${lista}.`;
  }

  // ---- Resumen general ----
  if (/resumen|estadistica|estadísticas|como esta|cómo está|general/.test(n)) {
    const scope = habs;
    const enReparacion = scope.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion').length;
    const enOtros = scope.filter(h => getOcup(h)?.tipo_habitacion === 'otros').length;
    const activas = scope.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
    const sinDatos = scope.filter(h => !getOcup(h)).length;
    let totalCamas = 0, camasOcupadas = 0;
    scope.forEach(h => {
      const o = getOcup(h);
      if (o?.tipo_habitacion === 'activa') {
        totalCamas += o.total_camas || 1;
        camasOcupadas += o.camas_ocupadas || 0;
      }
    });
    const pct = totalCamas > 0 ? ((camasOcupadas / totalCamas) * 100).toFixed(1) : '0.0';
    return (
      `${labelInicio} — Resumen:\n` +
      `• **${scope.length}** habitaciones en total\n` +
      `• **${activas}** activas con pacientes\n` +
      `• **${enReparacion}** en reparación\n` +
      `• **${enOtros}** en estado "Otros"\n` +
      `• **${sinDatos}** sin datos de hoy\n` +
      `• **${pct}%** de ocupación (${camasOcupadas}/${totalCamas} camas)`
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
  '¿Cuántas habitaciones hay en total?',
  '¿Cuántas habitaciones están en reparación?',
  '¿Cuántas habitaciones son "Otros"?',
  '¿Cuántas camas libres hay en total?',
  '¿Cuántas camas ocupadas hay en total?',
  '¿Cuál es el porcentaje de ocupación?',
  'Resumen general del hospital',
];

// ==================== Componente principal ====================
const AsistenteIA = ({ pisos, habitaciones }) => {
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

  // Cargar ocupación al abrir por primera vez
  useEffect(() => {
    if (abierto && !datosListos && habitaciones.length > 0) {
      cargarOcupacion();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, habitaciones]);

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

  const cargarOcupacion = async () => {
    try {
      setCargando(true);
      const ids = habitaciones.map(h => h.id);
      if (!ids.length) return;

      const { data } = await supabase
        .from('ocupacion_habitaciones')
        .select('habitacion_id, tipo_habitacion, camas_ocupadas, total_camas, fecha, actualizado_en')
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

    const respuesta = responder(texto, { pisos, habitaciones, ocupacion });

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
