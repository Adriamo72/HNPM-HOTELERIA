// components/AsistenteIA.jsx - Versión con voz
import React, { useState, useRef, useEffect, useCallback } from 'react';
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

const encontrarServicios = (texto, ocupacion) => {
  const n = norm(texto);
  const servicios = new Set();
  
  // Extraer servicios de informacion_ampliatoria
  Object.values(ocupacion).forEach(o => {
    if (o.informacion_ampliatoria) {
      servicios.add(o.informacion_ampliatoria.toLowerCase());
    }
  });
  
  // Buscar coincidencias exactas o parciales
  const serviciosArray = Array.from(servicios);
  const matches = serviciosArray.filter(s => n.includes(s) || s.includes(n));
  
  return matches.length > 0 ? matches : null;
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
  
  // Detectar si menciona un servicio
  const servicios = encontrarServicios(texto, ocupacion);

  // Filtrar habitaciones por piso si se menciona
  const habs = piso
    ? habitaciones.filter(h => String(h.piso_id) === String(piso.id))
    : habitaciones;

  const getOcup = (h) => ocupacion[h.id];
  const label = piso ? `en **${piso.nombre_piso}**` : 'en todo el hospital';
  const labelInicio = piso ? `**${piso.nombre_piso}**` : '**Todo el hospital**';

  // =========================================================
  // SCOPE: SERVICIO (prioridad si se menciona servicio específico)
  // =========================================================
  if (servicios && servicios.length > 0) {
    const labelServicio = servicios.length === 1 ? `**${servicios[0]}**` : `**${servicios.join(' + ')}**`;
    
    // Filtrar ocupaciones por servicio
    const ocuServicio = Object.values(ocupacion).filter(o => 
      o.informacion_ampliatoria && servicios.some(s => 
        norm(o.informacion_ampliatoria) === norm(s)
      )
    );
    
    // Filtrar habitaciones por servicio
    const habServicio = habitaciones.filter(h => {
      const o = getOcup(h);
      return o && o.informacion_ampliatoria && servicios.some(s => 
        norm(o.informacion_ampliatoria) === norm(s)
      );
    });

    // Habitaciones del servicio
    if (/habitaci[oó]n|habitaciones/.test(n)) {
      if (/activa|paciente/.test(n)) {
        const count = habServicio.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
        return `${labelServicio} tiene **${count}** habitación${count !== 1 ? 'es' : ''} activa${count !== 1 ? 's' : ''} con pacientes.`;
      }
      if (/reparaci[oó]n/.test(n)) {
        const count = habServicio.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion').length;
        return `${labelServicio} tiene **${count}** habitación${count !== 1 ? 'es' : ''} en reparación.`;
      }
      if (/otros|oficina|guardia|sala/.test(n)) {
        const count = habServicio.filter(h => getOcup(h)?.tipo_habitacion === 'otros').length;
        return `${labelServicio} tiene **${count}** habitación${count !== 1 ? 'es' : ''} de tipo "Otros".`;
      }
      const count = habServicio.length;
      return `${labelServicio} tiene **${count}** habitación${count !== 1 ? 'es' : ''} registradas.`;
    }

    // Camas del servicio
    if (/cama/.test(n)) {
      const stats = calcularStats(ocuServicio);
      if (!stats || stats.total === 0) {
        return `${labelServicio} no tiene camas activas.`;
      }
      if (/libre|disponible/.test(n)) {
        return `${labelServicio} tiene **${stats.libres}** cama${stats.libres !== 1 ? 's' : ''} libre${stats.libres !== 1 ? 's' : ''} (${stats.ocupadasReales} ocupadas de ${stats.total} totales).`;
      }
      if (/ocupad|usad/.test(n)) {
        return `${labelServicio} tiene **${stats.ocupadasReales}** cama${stats.ocupadasReales !== 1 ? 's' : ''} ocupada${stats.ocupadasReales !== 1 ? 's' : ''} con pacientes (${stats.aislamiento} bloqueadas por aislamiento).`;
      }
      if (/bloquead|aislamient/.test(n)) {
        return `${labelServicio} tiene **${stats.aislamiento}** cama${stats.aislamiento !== 1 ? 's' : ''} bloqueadas por aislamiento.`;
      }
      return `${labelServicio} tiene **${stats.total}** camas en total (${stats.ocupadasReales} ocupadas, ${stats.libres} libres, **${stats.pct}%** de ocupación).`;
    }

    // Resumen del servicio
    {
      const activas = habServicio.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
      const reparacion = habServicio.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion').length;
      const otros = habServicio.filter(h => getOcup(h)?.tipo_habitacion === 'otros').length;
      const stats = calcularStats(ocuServicio);
      
      return (
        `${labelServicio} — Resumen:\n` +
        `• **${stats.total}** camas totales\n` +
        `• **${stats.ocupadasReales}** camas ocupadas reales\n` +
        `• **${stats.aislamiento}** camas bloqueadas por aislamiento\n` +
        `• **${stats.libres}** camas disponibles\n` +
        `• **${stats.pct}%** de ocupación\n` +
        `• **${activas}** habitaciones activas\n` +
        `• **${reparacion}** en reparación\n` +
        `• **${otros}** de tipo "Otros"`
      );
    }
  }

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
    const activasConPacientes = scope.filter(h => getOcup(h)?.tipo_habitacion === 'activa' && getOcup(h)?.camas_ocupadas > 0).length;
    const sinDatos = scope.filter(h => !getOcup(h)).length;
    const { total, libres, pct, aislamiento, ocupadasReales } = calcularStats(scope.map(h => getOcup(h)).filter(Boolean));
    // Las camas disponibles ya tienen en cuenta las bloqueadas por aislamiento
    // No hay que restarlas nuevamente
    
    // Agrupar camas disponibles por servicio y piso para consultas detalladas
    const disponiblesPorServicioPiso = {};
    scope.forEach(h => {
      const ocup = getOcup(h);
      if (ocup?.tipo_habitacion === 'activa') {
        const camasLibres = Math.max(0, ocup.total_camas - ocup.camas_ocupadas - (ocup.observaciones?.includes('AISLAMIENTO') ? ocup.total_camas : 0));
        if (camasLibres > 0) {
          const servicio = ocup.informacion_ampliatoria?.trim() || 'Sin servicio';
          const piso = pisos.find(p => String(p.id) === String(h.piso_id))?.nombre_piso || 'Sin piso';
          const key = `${servicio} - ${piso}`;
          
          if (!disponiblesPorServicioPiso[key]) {
            disponiblesPorServicioPiso[key] = 0;
          }
          disponiblesPorServicioPiso[key] += camasLibres;
        }
      }
    });

    // Crear lista detallada de camas disponibles
    const detalleDisponibles = Object.entries(disponiblesPorServicioPiso)
      .sort((a, b) => {
        // Ordenar por piso primero, luego por servicio
        const pisoA = a[0].split(' - ')[1] || '';
        const pisoB = b[0].split(' - ')[1] || '';
        if (pisoA !== pisoB) {
          return pisoA.localeCompare(pisoB);
        }
        return a[0].localeCompare(b[0]);
      })
      .map(([servicioPiso, camas]) => `- ${camas} camas ${servicioPiso}`)
      .join('\n');
    
    // Usar el detalle solo si hay camas disponibles
    const detalleTexto = detalleDisponibles ? `\n${detalleDisponibles}` : '';
    
    return (
      `${labelInicio} - Resumen:\n` +
      `* **${total}** camas totales\n` +
      `* **${ocupadasReales}** camas ocupadas con pacientes\n` +
      `* **${aislamiento}** camas no utilizadas por aislamiento\n` +
      `* **${pct}%** de ocupación práctica\n` +
      `* **${libres}** camas disponibles global:${detalleTexto}\n` +
      `* **${scope.length}** habitaciones en total\n` +
      `* **${activas}** habitaciones activas\n` +
      `* **${activasConPacientes}** activas con pacientes\n` +
      `* **${enReparacion}** en reparación\n` +
      `* **${enOtros}** en estado "Otros"\n` +
      `* **${sinDatos}** sin datos de hoy`
    );
  }

  return 'No entendí la pregunta. Podés preguntarme por ejemplo:\n• ¿Cuántas habitaciones hay en el 6to piso?\n• ¿Cuántas camas libres hay?\n• ¿Cuál es el porcentaje de ocupación?\n• Resumen general del hospital\n• ¿Cuántas habitaciones tiene pediatría?\n• ¿Cuántas camas ocupadas tiene cardiología?\n• ¿Cuántas camas libres tiene clínica I?\n• ¿Cuántas camas bloqueadas tiene clínica II?\n• ¿Cuántas oficinas hay en el hospital?\n• ¿Cuántas salas de guardia hay?';
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
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const mensajesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Cargar datos al abrir
  useEffect(() => {
    if (abierto && habitaciones.length === 0) {
      cargarDatos();
    }
  }, [abierto, habitaciones.length]);

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

  const enviarPregunta = useCallback((textoInput) => {
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
    
    // Reproducir respuesta por voz automáticamente
    setTimeout(() => {
      speak(respuesta.replace(/\*\*/g, '').replace(/·/g, ''));
    }, 500);
  }, [cargando, pisos, habitaciones, ocupacion, speak]);

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

  // Inicializar speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-ES';
      
      recognition.onstart = () => {
        setIsListening(true);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        // Enviar automáticamente después de reconocer
        setTimeout(() => enviarPregunta(transcript), 500);
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setMensajes(prev => [...prev, { 
            tipo: 'bot', 
            texto: 'No se pudo acceder al micrófono. Por favor, permití el acceso al micrófono en tu navegador.' 
          }]);
        }
      };
      
      recognitionRef.current = recognition;
    }
  }, [enviarPregunta]);

  // Text-to-speech function
  const speak = (text) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Cancelar cualquier speech en curso
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      utterance.onstart = () => {
        setIsSpeaking(true);
      };
      
      utterance.onend = () => {
        setIsSpeaking(false);
      };
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
      };
      
      window.speechSynthesis.speak(utterance);
    }
  };

  // Voice input handler
  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
    }
  };

  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  // Enhanced enviarPregunta to include voice response
  const enviarPreguntaConVoz = (textoInput) => {
    if (!textoInput.trim()) return;

    const pregunta = { tipo: 'user', texto: textoInput };
    setMensajes(prev => [...prev, pregunta]);
    setInput('');

    if (cargando) {
      const respuesta = 'Cargando datos, esperá un momento...';
      setMensajes(prev => [...prev, { tipo: 'bot', texto: respuesta }]);
      speak(respuesta);
      return;
    }

    const respuesta = responder(textoInput, { pisos, habitaciones, ocupacion });
    setMensajes(prev => [...prev, { tipo: 'bot', texto: respuesta }]);
    
    // Speak the response
    speak(respuesta.replace(/\*\*/g, '').replace(/·/g, ''));
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
            
            {/* Voice control buttons */}
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)}
              className={`p-2 rounded-xl transition-colors ${
                isListening 
                  ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse' 
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={isListening ? 'Detener grabación' : 'Hablar para preguntar'}
            >
              {isListening ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3 3H5a3 3 0 01-3-3V5a3 3 0 013-3h14a3 3 0 013 3v6a3 3 0 01-3 3h-1" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3 3H5a3 3 0 01-3-3V5a3 3 0 013-3h14a3 3 0 013 3v6a3 3 0 01-3 3h-1" />
                </svg>
              )}
            </button>
            
            <button
              onClick={() => enviarPreguntaConVoz(input)}
              disabled={!input.trim() || isSpeaking}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-3 py-2 transition-colors"
              title="Enviar y escuchar respuesta"
            >
              {isSpeaking ? (
                <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 0112.728 0" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AsistenteIA;
