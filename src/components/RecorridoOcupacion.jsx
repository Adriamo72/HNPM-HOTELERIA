// components/RecorridoOcupacion.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import LiveQRScanner from './LiveQRScanner';

const RecorridoOcupacion = ({ perfilUsuario, pisoId, pisoNombre, onFinalizar }) => {
  const [modo, setModo] = useState('seleccionar_piso'); // seleccionar_piso, escaneo_rapido, modo_lista
  const [pisoSeleccionado, setPisoSeleccionado] = useState(null);
  const [pisosDisponibles, setPisosDisponibles] = useState([]);
  const [habitaciones, setHabitaciones] = useState([]);
  const [ocupaciones, setOcupaciones] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPisos();
  }, []);

  const cargarPisos = async () => {
    const { data } = await supabase.from('pisos').select('*').order('nombre_piso');
    setPisosDisponibles(data || []);
  };

  const seleccionarPiso = async (piso) => {
    setPisoSeleccionado(piso);
    
    // Cargar habitaciones del piso
    const { data: habs } = await supabase
      .from('habitaciones_especiales')
      .select('*')
      .eq('piso_id', piso.id);
    
    setHabitaciones(habs || []);
    
    // Cargar ocupaciones actuales
    const fecha = new Date().toISOString().split('T')[0];
    const { data: ocups } = await supabase
      .from('ocupacion_habitaciones')
      .select('*')
      .in('habitacion_id', (habs || []).map(h => h.id))
      .eq('fecha', fecha);
    
    const ocupMap = {};
    (ocups || []).forEach(ocup => {
      ocupMap[ocup.habitacion_id] = ocup;
    });
    setOcupaciones(ocupMap);
    
    setModo('modo_lista');
  };

  const actualizarOcupacion = (habitacionId, campo, valor) => {
    setOcupaciones(prev => ({
      ...prev,
      [habitacionId]: {
        ...prev[habitacionId],
        [campo]: valor,
        actualizado_por: perfilUsuario.dni,
        actualizado_en: new Date().toISOString()
      }
    }));
  };

  const guardarTodas = async () => {
    setGuardando(true);
    const fecha = new Date().toISOString().split('T')[0];
    
    try {
      for (const hab of habitaciones) {
        const ocup = ocupaciones[hab.id];
        if (!ocup) continue;
        
        const payload = {
          habitacion_id: hab.id,
          fecha: fecha,
          tipo_habitacion: 'activa',
          total_camas: ocup.total_camas || 1,
          camas_ocupadas: ocup.camas_ocupadas || 0,
          observaciones: ocup.observaciones || null,
          actualizado_por: perfilUsuario.dni,
          actualizado_en: new Date().toISOString()
        };
        
        const { error } = await supabase
          .from('ocupacion_habitaciones')
          .upsert(payload, { onConflict: 'habitacion_id,fecha' });
        
        if (error) throw error;
      }
      
      setMensaje('✅ Todas las ocupaciones guardadas');
      setTimeout(() => setMensaje(''), 2000);
      
      if (onFinalizar) onFinalizar();
    } catch (error) {
      console.error(error);
      setMensaje('❌ Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const handleScanSuccess = async (decodedText) => {
    if (modo !== 'escaneo_rapido') return;
    
    if (decodedText.includes('/ocupacion/')) {
      const slug = decodedText.split('/ocupacion/')[1];
      const { data: habitacion } = await supabase
        .from('habitaciones_especiales')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      
      if (habitacion && habitacion.piso_id === pisoSeleccionado?.id) {
        // Enfocar automáticamente en esta habitación
        document.getElementById(`habitacion-${habitacion.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setMensaje(`📌 Enfocado: ${habitacion.nombre}`);
        setTimeout(() => setMensaje(''), 1500);
      } else {
        setMensaje('❌ Habitación no pertenece a este piso');
        setTimeout(() => setMensaje(''), 1500);
      }
    }
  };

  // Pantalla de selección de piso
  if (modo === 'seleccionar_piso') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 p-6">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-white uppercase">Recorrido de Ocupación</h1>
            <p className="text-slate-400 text-sm mt-2">{perfilUsuario?.jerarquia} {perfilUsuario?.apellido}</p>
          </div>
          
          <div className="space-y-3">
            <p className="text-xs text-slate-500 uppercase font-bold mb-2">Seleccionar sector:</p>
            {pisosDisponibles.map(piso => (
              <button
                key={piso.id}
                onClick={() => seleccionarPiso(piso)}
                className="w-full bg-slate-800 hover:bg-slate-700 p-4 rounded-xl text-left transition-all border border-slate-700"
              >
                <span className="text-lg font-bold text-blue-400">{piso.nombre_piso}</span>
                <span className="text-xs text-slate-500 block mt-1">Tap para registrar ocupación</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Modo lista de habitaciones (más rápido)
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 p-4 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm p-4 rounded-xl mb-4 border border-slate-800">
        <div className="flex justify-between items-center">
          <div>
            <button 
              onClick={() => setModo('seleccionar_piso')}
              className="text-slate-400 text-sm mb-1"
            >
              ← Cambiar sector
            </button>
            <h2 className="text-xl font-bold text-blue-400">{pisoSeleccionado?.nombre_piso}</h2>
          </div>
          <button
            onClick={() => setModo(modo === 'modo_lista' ? 'escaneo_rapido' : 'modo_lista')}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${modo === 'escaneo_rapido' ? 'bg-green-600' : 'bg-slate-700'}`}
          >
            {modo === 'escaneo_rapido' ? '📱 Modo Escáner' : '📋 Modo Lista'}
          </button>
        </div>
        
        {/* Barra de progreso */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Progreso</span>
            <span>{Object.keys(ocupaciones).filter(id => ocupaciones[id]?.camas_ocupadas !== undefined).length}/{habitaciones.length}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${(Object.keys(ocupaciones).filter(id => ocupaciones[id]?.camas_ocupadas !== undefined).length / habitaciones.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Modo Escáner Rápido */}
      {modo === 'escaneo_rapido' && (
        <div className="mb-6">
          <LiveQRScanner 
            onScanSuccess={handleScanSuccess}
            onScanError={() => {}}
          />
          <p className="text-center text-xs text-slate-500 mt-2">
            📷 Escanea QR de ocupación para ir directamente a la habitación
          </p>
        </div>
      )}

      {/* Lista de habitaciones */}
      <div className="space-y-3">
        {habitaciones.map(hab => {
          const ocup = ocupaciones[hab.id] || {};
          const totalCamas = ocup.total_camas || 1;
          const camasOcupadas = ocup.camas_ocupadas || 0;
          
          return (
            <div 
              key={hab.id} 
              id={`habitacion-${hab.id}`}
              className="bg-slate-800/50 rounded-xl p-4 border border-slate-700"
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-white">{hab.nombre}</h3>
                <span className="text-xs text-slate-500">Camas: {totalCamas}</span>
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => actualizarOcupacion(hab.id, 'camas_ocupadas', Math.max(0, camasOcupadas - 1))}
                  className="w-12 h-12 bg-red-900/50 rounded-xl text-2xl font-bold text-red-400 active:scale-95"
                >
                  -
                </button>
                
                <div className="flex-1 text-center">
                  <input
                    type="number"
                    min="0"
                    max={totalCamas}
                    value={camasOcupadas}
                    onChange={(e) => actualizarOcupacion(hab.id, 'camas_ocupadas', Math.min(totalCamas, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full bg-slate-900 text-4xl font-black text-center text-green-400 rounded-xl p-3 outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Pacientes ocupando cama</p>
                </div>
                
                <button
                  onClick={() => actualizarOcupacion(hab.id, 'camas_ocupadas', Math.min(totalCamas, camasOcupadas + 1))}
                  className="w-12 h-12 bg-green-900/50 rounded-xl text-2xl font-bold text-green-400 active:scale-95"
                >
                  +
                </button>
              </div>
              
              {/* Indicador de estado */}
              <div className="mt-3 flex justify-between items-center text-xs">
                <span className={`px-2 py-1 rounded-full ${camasOcupadas === totalCamas ? 'bg-red-900/50 text-red-400' : camasOcupadas > 0 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-green-900/50 text-green-400'}`}>
                  {camasOcupadas === totalCamas ? '🟢 COMPLETO' : camasOcupadas > 0 ? '🟡 PARCIAL' : '🔴 VACÍO'}
                </span>
                {ocup.actualizado_en && (
                  <span className="text-slate-600">
                    {new Date(ocup.actualizado_en).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Botón guardar flotante */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 to-transparent">
        <button
          onClick={guardarTodas}
          disabled={guardando}
          className="w-full bg-gradient-to-r from-green-600 to-green-500 p-4 rounded-xl font-black text-white uppercase shadow-lg active:scale-95 disabled:opacity-50"
        >
          {guardando ? 'GUARDANDO...' : '✅ GUARDAR TODAS LAS OCUPACIONES'}
        </button>
      </div>
      
      {mensaje && (
        <div className="fixed top-20 left-4 right-4 bg-blue-600 text-white p-3 rounded-xl text-center shadow-xl z-20">
          {mensaje}
        </div>
      )}
    </div>
  );
};

export default RecorridoOcupacion;