// components/AsistenteIA.jsx - Versión limpia y simplificada
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

const encontrarServicio = (texto, ocupacion) => {
  const n = norm(texto);
  const servicios = new Set();
  
  Object.values(ocupacion).forEach(o => {
    if (o.informacion_ampliatoria) {
      servicios.add(o.informacion_ampliatoria.toLowerCase());
    }
  });
  
  const serviciosArray = Array.from(servicios);
  const matches = serviciosArray.filter(s => {
    if (n.includes(s) || s.includes(n)) return true;
    
    const palabrasClave = ['pediatria', 'pediatría', 'clinica', 'clínica', 'traumatologia', 'traumatología', 'cardiologia', 'cardiología', 'cirugia', 'cirugía'];
    const servicioNormalizado = norm(s);
    
    for (const palabra of palabrasClave) {
      if (n.includes(palabra) && servicioNormalizado.includes(palabra)) return true;
    }
    
    if (n.includes('pediatri') || n.includes('pediatr')) {
      if (servicioNormalizado.includes('pediatri') || servicioNormalizado.includes('pediatr')) return true;
    }
    
    if (n.includes('clinic') || n.includes('clín')) {
      if (servicioNormalizado.includes('clinic') || servicioNormalizado.includes('clín')) return true;
    }
    
    return false;
  });
  
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

      // Calcular camas bloqueadas por aislamiento usando aislamiento_activo
      if (Boolean(o?.aislamiento_activo) && camasOcupadas > 0 && totalCamas > 0) {
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

// ==================== Motor de respuestas simplificado ====================
function responder(texto, { pisos, habitaciones, ocupacion }) {
  if (!pisos.length || !habitaciones.length) {
    return 'Todavía estoy cargando los datos. Intentá en un momento.';
  }

  const n = norm(texto);
  
  // Detectar si menciona un piso
  const piso = encontrarPisoPorNumero(pisos, texto);
  
  // Detectar si menciona un servicio
  const servicios = encontrarServicio(texto, ocupacion);

  // Filtrar habitaciones por piso si se menciona
  const habs = piso
    ? habitaciones.filter(h => String(h.piso_id) === String(piso.id))
    : habitaciones;

  const getOcup = (h) => ocupacion[h.id];

  // =========================================================
  // RESPUESTAS ESPECÍFICAS CORTAS Y PRECISAS
  // =========================================================

  // Habitaciones de internación por piso
  if (/habitaci[oó]n|habitaciones/.test(n) && /internaci[oó]n/.test(n) && piso) {
    const count = habs.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
    return `Hay ${count} habitaciones de internación en el ${piso.nombre_piso}.`;
  }

  // Habitaciones en reparación por piso
  if (/habitaci[oó]n|habitaciones/.test(n) && /reparaci[oó]n/.test(n) && piso) {
    const count = habs.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion').length;
    return `Hay ${count} habitaciones en reparación en el ${piso.nombre_piso}.`;
  }

  // Habitaciones en reparación total
  if (/habitaci[oó]n|habitaciones/.test(n) && /reparaci[oó]n/.test(n)) {
    const count = habs.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion').length;
    return `Hay ${count} habitaciones en reparación en el hospital.`;
  }

  // Camas disponibles por piso
  if (/cama/.test(n) && /disponible|libre/.test(n) && piso) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    return `Hay ${stats.libres} camas disponibles en el ${piso.nombre_piso}.`;
  }

  // Camas disponibles total
  if (/cama/.test(n) && /disponible|libre/.test(n)) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    return `Hay ${stats.libres} camas disponibles en el hospital.`;
  }

  // Camas disponibles por servicio
  if (/cama/.test(n) && /disponible|libre/.test(n) && servicios) {
    const ocuServicio = Object.values(ocupacion).filter(o => 
      o.informacion_ampliatoria && servicios.some(s => 
        norm(o.informacion_ampliatoria) === norm(s)
      )
    );
    const stats = calcularStats(ocuServicio);
    return `${servicios.join(' + ')} tiene ${stats.libres} camas disponibles.`;
  }

  // Ocupación general del hospital
  if (/ocupaci[oó]n/.test(n) && !piso && !servicios) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    return `La ocupación del hospital es del ${stats.pct}% (${stats.ocupadas} de ${stats.total} camas).`;
  }

  // Pacientes internados total
  if (/paciente|pacientes/.test(n) && !piso && !servicios) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    return `Hay ${stats.ocupadasReales} pacientes internados en el hospital.`;
  }

  // Pacientes internados por piso
  if (/paciente|pacientes/.test(n) && piso) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    return `Hay ${stats.ocupadasReales} pacientes internados en el ${piso.nombre_piso}.`;
  }

  // Camas bloqueadas total
  if (/cama/.test(n) && /bloquead|aislamient/.test(n)) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    return `Hay ${stats.aislamiento} camas bloqueadas por aislamiento en el hospital.`;
  }

  // Habitaciones bloqueadas total
  if (/habitaci[oó]n|habitaciones/.test(n) && /bloquead|aislamient/.test(n)) {
    const count = habs.filter(h => Boolean(getOcup(h)?.aislamiento_activo)).length;
    return `Hay ${count} habitaciones bloqueadas por aislamiento en el hospital.`;
  }

  // Estado de habitación específica
  const habitacionMatch = n.match(/habitaci[oó]n\s*(\d+)/);
  if (habitacionMatch) {
    const numHabitacion = habitacionMatch[1];
    const habitacion = habs.find(h => h.nombre === numHabitacion);
    
    if (habitacion) {
      const o = getOcup(habitacion);
      if (o) {
        let estado = `Habitación ${habitacion.nombre}: `;
        
        if (o.tipo_habitacion === 'activa') {
          estado += `${o.total_camas} camas totales, ${o.camas_ocupadas} ocupadas, ${Math.max(0, o.total_camas - o.camas_ocupadas)} libres`;
          if (Boolean(o?.aislamiento_activo)) {
            estado += ' (con aislamiento)';
          }
        } else if (o.tipo_habitacion === 'reparacion') {
          estado += 'En reparación';
        } else if (o.tipo_habitacion === 'otros') {
          estado += 'Otros';
        }
        
        if (o.observaciones) {
          estado += `. Observaciones: ${o.observaciones}`;
        }
        
        if (o.informacion_ampliatoria) {
          estado += `. Servicio: ${o.informacion_ampliatoria}`;
        }
        
        
        return estado + '.';
      } else {
        return `Habitación ${numHabitacion}: Sin datos recientes.`;
      }
    } else {
      return `No se encontró la habitación ${numHabitacion} ${piso ? `en el ${piso.nombre_piso}` : 'en el hospital'}.`;
    }
  }

  // Habitaciones por número (formato corto: "401", "502", etc.)
  const habitacionCortaMatch = n.match(/^(\d{3})$/);
  if (habitacionCortaMatch) {
    const numHabitacion = habitacionCortaMatch[1];
    const habitacion = habs.find(h => h.nombre === numHabitacion);
    
    if (habitacion) {
      const o = getOcup(habitacion);
      if (o) {
        let estado = `Habitación ${habitacion.nombre}: `;
        
        if (o.tipo_habitacion === 'activa') {
          estado += `${o.total_camas} camas, ${o.camas_ocupadas} ocupadas, ${Math.max(0, o.total_camas - o.camas_ocupadas)} libres`;
          if (Boolean(o?.aislamiento_activo)) {
            estado += ' (aislamiento)';
          }
        } else if (o.tipo_habitacion === 'reparacion') {
          estado += 'En reparación';
        } else if (o.tipo_habitacion === 'otros') {
          estado += 'Otros';
        }
        
                
        if (o.informacion_ampliatoria) {
          estado += `. ${o.informacion_ampliatoria}`;
        }
        
        if (o.observaciones) {
          estado += `. Observaciones: ${o.observaciones}`;
        }
        
        return estado + '.';
      } else {
        return `Habitación ${numHabitacion}: Sin datos.`;
      }
    } else {
      return `No existe la habitación ${numHabitacion}.`;
    }
  }

  // Resumen general
  if (/resumen|general|estad[ií]stica|como est[aá]/.test(n)) {
    const stats = calcularStats(habs.map(h => getOcup(h)).filter(Boolean));
    const activas = habs.filter(h => getOcup(h)?.tipo_habitacion === 'activa').length;
    const reparacion = habs.filter(h => getOcup(h)?.tipo_habitacion === 'reparacion').length;
    
    return (
      `Resumen del hospital:\n` +
      `• ${stats.total} camas totales\n` +
      `• ${stats.ocupadasReales} pacientes\n` +
      `• ${stats.aislamiento} camas bloqueadas por aislamiento\n` +
      `• ${stats.libres} camas disponibles\n` +
      `• ${stats.pct}% de ocupación\n` +
      `• ${activas} habitaciones activas\n` +
      `• ${reparacion} en reparación`
    );
  }

  return 'No entendí la pregunta. Podés preguntar:\n\n• Cuántas habitaciones de internación hay en el cuarto piso?\n• Cuántas camas disponibles hay en el sexto piso?\n• Cuántas habitaciones en reparación hay en el sexto piso?\n• Cuántas camas disponibles tiene Clínica 1?\n• Cuánta ocupación hay en el hospital?\n• Cuántos pacientes internados hay en el hospital?\n• Cuántas camas bloqueadas hay?\n• Cuántas habitaciones bloqueadas hay?\n• Estado de habitación 402?\n• 401? (número de habitación)';
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

      // Cargar habitaciones y ocupación como CroquisPiso
      const [resHabs, resOcupacion] = await Promise.all([
        supabase.from('habitaciones_especiales').select('id, piso_id, nombre').order('nombre'),
        supabase.from('ocupacion_habitaciones').select('*, aislamiento_activo').order('fecha', { ascending: false }),
      ]);

      if (resHabs.error) throw resHabs.error;
      if (resOcupacion.error) throw resOcupacion.error;
      
      setHabitaciones(resHabs.data || []);
      
      // Procesar ocupación priorizando el registro más reciente por fecha
      const ocupMap = {};
      (resOcupacion.data || []).forEach(occ => {
        if (!ocupMap[occ.habitacion_id]) {
          ocupMap[occ.habitacion_id] = occ;
        }
      });

      setOcupacion(ocupMap);
      setDatosListos(true);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setCargando(false);
    }
  };

  
  // Text-to-speech function
  const speak = useCallback((text) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
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
  }, []);

  const enviarPregunta = useCallback(async (textoInput) => {
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

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
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
              {['¿Cuántas habitaciones de internación hay en el cuarto piso?', '¿Cuántas camas disponibles hay en el sexto piso?', '¿Cuánta ocupación hay en el hospital?', 'Estado de habitación 402?'].map((s, i) => (
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
              placeholder="Pregúntame sobre las habitaciones..."
              className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500 transition-colors"
            />
            
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
              onClick={() => enviarPregunta(input)}
              disabled={!input.trim() || isSpeaking}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-3 py-2 transition-colors"
              title="Enviar pregunta"
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
