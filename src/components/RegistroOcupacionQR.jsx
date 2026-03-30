// components/RegistroOcupacionQR.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import LiveQRScanner from './LiveQRScanner';

const RegistroOcupacionQR = ({ perfilUsuario, onRegistroCompleto }) => {
  const [escanear, setEscanear] = useState(true);
  const [habitacion, setHabitacion] = useState(null);
  const [tipoHabitacion, setTipoHabitacion] = useState('activa');
  const [totalCamas, setTotalCamas] = useState(1);
  const [camasOcupadas, setCamasOcupadas] = useState(0);
  const [novedades, setNovedades] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const handleScanSuccess = async (decodedText) => {
    if (!escanear) return;
    
    if (decodedText.includes('/ocupacion/')) {
      const slug = decodedText.split('/ocupacion/')[1];
      
      const { data: habitacionData, error } = await supabase
        .from('habitaciones_especiales')
        .select('*, pisos(nombre_piso)')
        .eq('slug', slug)
        .maybeSingle();
      
      if (error || !habitacionData) {
        setMensaje("❌ Habitación no encontrada");
        setTimeout(() => setMensaje(''), 2000);
        return;
      }
      
      setHabitacion(habitacionData);
      setEscanear(false);
      
      // Cargar estado actual de la habitación (último registro disponible)
      const { data: estadoActual, error: estadoError } = await supabase
        .from('ocupacion_habitaciones')
        .select('*')
        .eq('habitacion_id', habitacionData.id)
        .order('fecha', { ascending: false })
        .order('actualizado_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (estadoError) {
        console.error('Error cargando estado de habitación:', estadoError);
      }

      if (estadoActual) {
        setTipoHabitacion(estadoActual.tipo_habitacion || 'activa');
        setTotalCamas(estadoActual.total_camas || 1);
        setCamasOcupadas(estadoActual.camas_ocupadas || 0);
        setNovedades(estadoActual.observaciones || '');
      }
      
      setMensaje(`✅ Habitación: ${habitacionData.nombre}`);
    } else {
      setMensaje("❌ Escanea un QR de ocupación válido (debe contener /ocupacion/)");
      setTimeout(() => setMensaje(''), 2000);
    }
  };

  const handleScanError = (err) => {
    console.warn("Error:", err);
  };

  const registrarOcupacion = async () => {
    if (!habitacion) return;
    
    setRegistrando(true);
    
    try {
      if (tipoHabitacion !== 'activa') {
        setMensaje('❌ Esta habitación no está habilitada para registro de ocupación');
        setTimeout(() => setMensaje(''), 2000);
        setRegistrando(false);
        return;
      }

      const fecha = new Date().toISOString().split('T')[0];
      const { data: existing, error: existingError } = await supabase
        .from('ocupacion_habitaciones')
        .select('id')
        .eq('habitacion_id', habitacion.id)
        .eq('fecha', fecha)
        .maybeSingle();

      if (existingError) throw existingError;

      const payload = {
        habitacion_id: habitacion.id,
        fecha: fecha,
        tipo_habitacion: tipoHabitacion,
        total_camas: totalCamas,
        camas_ocupadas: camasOcupadas,
        observaciones: novedades || null,
        actualizado_por: perfilUsuario?.dni,
        actualizado_en: new Date().toISOString()
      };

      let error;
      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('ocupacion_habitaciones')
          .update(payload)
          .eq('id', existing.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('ocupacion_habitaciones')
          .insert(payload);
        error = insertError;
      }

      if (error) throw error;
      
      const mensajeExito = `✅ ${habitacion.nombre}: ${camasOcupadas}/${totalCamas} camas ocupadas`;
      
      setMensaje(mensajeExito);
      setTimeout(() => {
        setMensaje('');
        setEscanear(true);
        setHabitacion(null);
        setTipoHabitacion('activa');
        setTotalCamas(1);
        setCamasOcupadas(0);
        setNovedades('');
        if (onRegistroCompleto) onRegistroCompleto();
      }, 1500);
      
    } catch (error) {
      console.error("Error:", error);
      setMensaje("❌ Error al registrar");
      setTimeout(() => setMensaje(''), 2000);
    } finally {
      setRegistrando(false);
    }
  };

  if (escanear) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl p-6 max-w-md w-full shadow-2xl border border-green-900/30">
          <div className="text-center mb-4">
            <div className="bg-gradient-to-r from-green-600 to-green-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-green-900/40">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-xl font-black text-white uppercase tracking-wider">
              REGISTRO DE OCUPACIÓN
            </h1>
            <p className="text-green-400 text-[10px] uppercase tracking-wider mt-1 font-semibold">
              Escanea QR de ocupación en la puerta
            </p>
          </div>

          <LiveQRScanner 
            onScanSuccess={handleScanSuccess}
            onScanError={handleScanError}
          />
          
          {mensaje && (
            <div className="mt-4 text-center text-sm text-yellow-400">{mensaje}</div>
          )}
          
          <p className="text-slate-600 text-[9px] uppercase mt-4 tracking-wider text-center">
            Subdirección Administrativa - Departamento Hotelería
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl p-6 max-w-md w-full shadow-2xl border border-green-900/30">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-green-400">
            {habitacion?.nombre}
          </h3>
          <button 
            onClick={() => {
              setEscanear(true);
              setHabitacion(null);
            }}
            className="text-slate-400 text-sm hover:text-white"
          >
            ← Cambiar
          </button>
        </div>
        
        {/* Tipo de habitación */}
        <div className="mb-4 bg-slate-800 p-4 rounded-2xl border border-slate-700">
          <p className="text-xs font-black uppercase text-slate-400 mb-3">Situación configurada en ADMINISTRACIÓN</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-950/80 p-3 rounded-xl">
              <span className="block text-[10px] uppercase text-slate-500">Estado</span>
              <span className="font-bold text-white">
                {tipoHabitacion === 'activa' ? 'Internación' : tipoHabitacion === 'reparacion' ? 'En reparación' : 'Otros'}
              </span>
            </div>
            <div className="bg-slate-950/80 p-3 rounded-xl">
              <span className="block text-[10px] uppercase text-slate-500">Camas totales</span>
              <span className="font-bold text-white">{totalCamas}</span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
            Pacientes ocupando camas
          </label>
          <input
            type="number"
            min="0"
            max={totalCamas}
            value={camasOcupadas}
            onChange={(e) => setCamasOcupadas(Math.min(Math.max(parseInt(e.target.value) || 0, 0), totalCamas))}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-3xl text-green-400 font-black text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
        
        <button
          onClick={registrarOcupacion}
          disabled={registrando}
          className="w-full bg-green-600 py-3 rounded-xl font-bold uppercase disabled:opacity-50 hover:bg-green-500 transition-all"
        >
          {registrando ? 'REGISTRANDO...' : '✅ REGISTRAR OCUPACIÓN'}
        </button>
        
        {mensaje && (
          <div className="mt-3 text-center text-sm text-green-400">{mensaje}</div>
        )}
        
        <p className="text-slate-600 text-[9px] uppercase mt-4 tracking-wider text-center">
          Subdirección Administrativa - Departamento Hotelería
        </p>
      </div>
    </div>
  );
};

export default RegistroOcupacionQR;