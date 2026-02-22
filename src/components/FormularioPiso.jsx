import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = [
  'SABANAS', 'TOALLA', 'TOALLON', 'FRAZADAS', 
  'SALEA HULE', 'SALEA TELA', 'FUNDAS', 'CUBRECAMAS'
];

const FormularioPiso = ({ dniPañolero, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [enfermeros, setEnfermeros] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '', tipo: '' });
  const [datos, setDatos] = useState({
    item: 'SABANAS', entregado_limpio: 0, retirado_sucio: 0, stock_fisico_piso: 0,
    dni_enfermero: '', comentarios: ''
  });

  useEffect(() => { cargarContexto(); }, [slugPiso]);

  const mostrarSplash = (mensaje, tipo = 'success') => {
    setNotificacion({ visible: true, mensaje, tipo });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '', tipo: '' }), 3000);
  };

  const cargarContexto = async () => {
    const { data: dataPiso } = await supabase.from('pisos').select('*').eq('slug', slugPiso).single();
    if (dataPiso) {
      setPiso(dataPiso);
      const { data: dataEnf } = await supabase.from('personal').select('*').eq('rol', 'enfermero').order('apellido');
      setEnfermeros(dataEnf || []);
      cargarHistorialPiso(dataPiso.id);
    }
  };

  const cargarHistorialPiso = async (pisoId) => {
    const { data } = await supabase.from('movimientos_stock')
      .select('*, personal!movimientos_stock_dni_enfermero_fkey(apellido, jerarquia)')
      .eq('piso_id', pisoId)
      .order('created_at', { ascending: false })
      .limit(5);
    setHistorial(data || []);
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    if (!datos.dni_enfermero) return mostrarSplash("Seleccione Responsable", "error");

    const { error } = await supabase.from('movimientos_stock').insert([{
      piso_id: piso.id,
      dni_pañolero: dniPañolero,
      dni_enfermero: datos.dni_enfermero,
      item: datos.item,
      entregado_limpio: parseInt(datos.entregado_limpio),
      retirado_sucio: parseInt(datos.retirado_sucio),
      stock_fisico_piso: parseInt(datos.stock_fisico_piso),
      comentarios: datos.comentarios
    }]);

    if (error) mostrarSplash("Error: " + error.message, "error");
    else {
      mostrarSplash(`Registro de ${datos.item} Exitoso`);
      setDatos({ ...datos, entregado_limpio: 0, retirado_sucio: 0, stock_fisico_piso: 0, comentarios: '' });
      cargarHistorialPiso(piso.id);
    }
  };

  if (!piso) return <div className="p-10 text-white animate-pulse uppercase text-center">Sincronizando con Sentinel...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20">
      {/* NOTIFICACIÓN TIPO SPLASH */}
      {notificacion.visible && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl border transition-all animate-bounce ${notificacion.tipo === 'success' ? 'bg-green-600 border-green-400' : 'bg-red-600 border-red-400'}`}>
          <p className="text-white font-black uppercase text-xs tracking-widest">{notificacion.mensaje}</p>
        </div>
      )}

      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-blue-500 uppercase italic tracking-tighter">{piso.nombre_piso}</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Control de Activos de Hotelería</p>
        </div>
      </div>

      <form onSubmit={enviarRegistro} className="space-y-4 bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Prenda</label>
            <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 font-bold text-blue-300" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
              {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Enfermero Responsable</label>
            <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm" value={datos.dni_enfermero} onChange={e => setDatos({...datos, dni_enfermero: e.target.value})} required>
              <option value="">Seleccionar...</option>
              {enfermeros.map(enf => <option key={enf.dni} value={enf.dni}>{enf.jerarquia} {enf.apellido}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <label className="text-[9px] font-black text-green-600 uppercase mb-1 block">Entrego Limpio</label>
            <input type="number" className="bg-transparent w-full text-xl font-black outline-none" value={datos.entregado_limpio} onChange={e => setDatos({...datos, entregado_limpio: e.target.value})} />
          </div>
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <label className="text-[9px] font-black text-red-600 uppercase mb-1 block">Retiro Sucio</label>
            <input type="number" className="bg-transparent w-full text-xl font-black outline-none" value={datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
          </div>
        </div>

        <div className="bg-blue-900/10 p-4 rounded-2xl border border-blue-900/30">
          <label className="text-[9px] font-black text-blue-400 uppercase mb-1 block tracking-widest">Stock Remanente en Piso</label>
          <input type="number" className="bg-transparent w-full text-2xl font-black outline-none text-blue-200" value={datos.stock_fisico_piso} onChange={e => setDatos({...datos, stock_fisico_piso: e.target.value})} />
        </div>

        <button type="submit" className="w-full bg-blue-600 p-5 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-blue-900/40 active:scale-95 transition-all text-sm">
          Confirmar y Firmar Entrega
        </button>
      </form>

      {/* HISTORIAL TEMPORAL DE ESTE PISO */}
      <div className="space-y-4">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest px-2">Últimos Registros en este Sector</h3>
        {historial.map((h) => (
          <div key={h.id} className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black text-blue-400 uppercase">{h.item}</p>
              <p className="text-[9px] text-slate-500 font-mono">RECIBE: {h.personal?.jerarquia} {h.personal?.apellido}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-black">+{h.entregado_limpio} | -{h.retirado_sucio}</p>
              <p className="text-[8px] text-slate-600 uppercase font-bold">{new Date(h.created_at).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FormularioPiso;