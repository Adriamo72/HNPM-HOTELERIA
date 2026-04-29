// components/AsistenteIA.jsx - Versión con IA (DeepSeek)
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

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
      const [resHabs, resOcupacion] = await Promise.all([
        supabase.from('habitaciones_especiales').select('id, piso_id, nombre').order('nombre'),
        supabase.from('ocupacion_habitaciones').select('*, aislamiento_activo').order('fecha', { ascending: false }),
      ]);

      if (resHabs.error) throw resHabs.error;
      if (resOcupacion.error) throw resOcupacion.error;
      
      setHabitaciones(resHabs.data || []);
      
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

  // Text-to-speech
  const speak = useCallback((text) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // Consultar a DeepSeek (IA)
  const consultarDeepSeek = useCallback(async (mensaje, historialMensajes) => {
    try {
      const { data, error } = await supabase.functions.invoke('deepseek-bot', {
        body: {
          mensaje: mensaje,
          historial: historialMensajes,
          contextoHospital: { pisos, habitaciones, ocupacion }
        }
      });
      
      if (error) throw error;
      return data.respuesta;
    } catch (err) {
      console.error('Error en IA:', err);
      return 'Lo siento, tuve un problema. Por favor, intenta de nuevo.';
    }
  }, [pisos, habitaciones, ocupacion]);

  // Enviar pregunta usando IA
  const enviarPregunta = useCallback(async (textoInput) => {
    if (!textoInput.trim() || cargando) return;

    const pregunta = { tipo: 'user', texto: textoInput };
    setMensajes(prev => [...prev, pregunta]);
    setInput('');
    setCargando(true);

    try {
      const respuesta = await consultarDeepSeek(textoInput, [...mensajes, pregunta]);
      setMensajes(prev => [...prev, { tipo: 'bot', texto: respuesta }]);
      setTimeout(() => {
        speak(respuesta.replace(/\*\*/g, '').replace(/·/g, ''));
      }, 200);
    } catch (error) {
      console.error('Error:', error);
      setMensajes(prev => [...prev, { 
        tipo: 'bot', 
        texto: 'Lo siento, hubo un error. Por favor, intenta de nuevo.' 
      }]);
    } finally {
      setCargando(false);
    }
  }, [mensajes, cargando, speak, consultarDeepSeek]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarPregunta(input);
    }
  };

  useEffect(() => {
    mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  useEffect(() => {
    if (abierto) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [abierto]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-ES';
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
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

      {abierto && (
        <div className="fixed bottom-24 right-4 z-50 w-[min(95vw,400px)] h-[min(80vh,520px)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-sm">🤖</div>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold">Asistente IA</p>
              <p className="text-slate-400 text-xs">
                {cargando ? 'Pensando...' : datosListos ? 'Con IA lista' : 'Conectando...'}
              </p>
            </div>
            <button onClick={cargarDatos} className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {mensajes.map((msg, i) => (
              <div key={i} className={`flex ${msg.tipo === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                  msg.tipo === 'user'
                    ? 'bg-green-600 text-white rounded-br-sm'
                    : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                }`}>
                  {msg.texto.split('**').map((part, i) =>
                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                  )}
                </div>
              </div>
            ))}
            {cargando && (
              <div className="flex justify-start">
                <div className="bg-slate-700 text-slate-400 px-3 py-2 rounded-2xl rounded-bl-sm text-xs">
                  La IA está pensando...
                </div>
              </div>
            )}
            <div ref={mensajesEndRef} />
          </div>

          {mensajes.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1 flex-shrink-0">
              {['¿Cuántas habitaciones de internación hay en el cuarto piso?', '¿Cuántas camas disponibles hay en el sexto piso?', '¿Cuánta ocupación hay en el hospital?', 'Estado de habitación 402?'].map((s, i) => (
                <button key={i} onClick={() => enviarPregunta(s)} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-full px-3 py-1 transition-colors text-left">
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 px-3 py-3 border-t border-slate-700 flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregúntame cualquier cosa sobre el hospital..."
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3 3H5a3 3 0 01-3-3V5a3 3 0 013-3h14a3 3 0 013 3v6a3 3 0 01-3 3h-1" />
              </svg>
            </button>
            
            <button
              onClick={() => enviarPregunta(input)}
              disabled={!input.trim() || isSpeaking || cargando}
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