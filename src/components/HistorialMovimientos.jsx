import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const HistorialMovimientos = () => {
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerMovimientos();
  }, []);

  const obtenerMovimientos = async () => {
    const { data, error } = await supabase
      .from('movimientos_stock')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) console.error("Error al traer datos:", error);
    else setMovimientos(data);
    setCargando(false);
  };

  if (cargando) return <div className="text-white p-10 text-center uppercase tracking-widest animate-pulse">Sincronizando con Sentinel DB...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-100">
      <h2 className="text-xl font-black text-blue-400 mb-6 uppercase tracking-tighter border-b border-blue-900 pb-2">
        Últimos Movimientos - Sentinel AI
      </h2>
      
      <div className="space-y-4">
        {movimientos.map((m) => (
          <div key={m.id} className={`p-4 rounded-xl border ${m.discrepancia !== 0 ? 'border-red-500 bg-red-950/20' : 'border-slate-800 bg-slate-900 shadow-lg'}`}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-mono text-slate-500">
                {new Date(m.created_at).toLocaleString('es-AR')}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${m.discrepancia !== 0 ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                Piso {m.piso}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Ítem</p>
                <p className="font-bold text-blue-300">{m.item}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-[10px] uppercase font-bold">Cant. Entregada</p>
                <p className="text-lg font-black">{m.entregado}</p>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/50 flex justify-between text-[10px] text-slate-500 font-mono">
                <span>PAÑOLERO: {m.dni_pañolero}</span>
                <span>RESP. PISO: {m.dni_enfermero}</span>
            </div>

            {m.discrepancia !== 0 && (
              <div className="mt-2 p-2 bg-red-600/10 rounded border border-red-500/30">
                <p className="text-[10px] text-red-400 font-bold uppercase">⚠️ Discrepancia: {m.discrepancia} unidades</p>
                <p className="text-[11px] italic text-slate-300">Motivo: {m.motivo_discrepancia}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <button 
        onClick={obtenerMovimientos}
        className="mt-8 w-full py-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-700 transition-all"
      >
        Actualizar Datos
      </button>
    </div>
  );
};

export default HistorialMovimientos;