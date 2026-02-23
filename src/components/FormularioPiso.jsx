import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = [
  'SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 
  'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'
];

const FormularioPiso = ({ perfilUsuario, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [enfermeros, setEnfermeros] = useState([]);
  const [modo, setModo] = useState('piso'); 
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [registrosSesion, setRegistrosSesion] = useState([]);
  
  const [datos, setDatos] = useState({
    item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0, stock_fisico_piso: 0,
    dni_enfermero: '', comentarios: ''
  });

  useEffect(() => {
    const cargarContexto = async () => {
      const { data: dataPiso } = await supabase.from('pisos').select('*').eq('slug', slugPiso).single();
      if (dataPiso) {
        setPiso(dataPiso);
        const { data: dataEnf } = await supabase.from('personal').select('*').eq('rol', 'enfermero').order('apellido');
        setEnfermeros(dataEnf || []);
      }
    };
    cargarContexto();
  }, [slugPiso]);

  const mostrarSplash = (mensaje) => {
    setNotificacion({ visible: true, mensaje });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 3500);
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    
    const registroAInsertar = {
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: modo === 'piso' ? datos.dni_enfermero : null,
      item: datos.item,
      // MODO PISO: Solo Entrega (Egreso)
      entregado_limpio: modo === 'piso' ? 0 : parseInt(datos.carga_lavadero), 
      egreso_limpio: modo === 'piso' ? parseInt(datos.entrega_piso) : 0,
      // MODO LAVADERO: Solo Sucio e Ingreso de Lavadero
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio) : 0,
      stock_fisico_piso: parseInt(datos.stock_fisico_piso),
      comentarios: `MODO_${modo.toUpperCase()}`
    };

    const { error } = await supabase.from('movimientos_stock').insert([registroAInsertar]);

    if (error) {
      mostrarSplash(`Error: ${error.message}`);
    } else {
      mostrarSplash(`${datos.item} REGISTRADO`);
      
      const nuevoMov = {
        ...registroAInsertar,
        hora: new Date().toLocaleTimeString(),
        enfermero_nom: enfermeros.find(en => en.dni === datos.dni_enfermero)?.apellido || 'LAVADERO'
      };
      setRegistrosSesion([nuevoMov, ...registrosSesion]);
      setDatos({ ...datos, carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0, stock_fisico_piso: 0 });
    }
  };

  if (!piso) return <div className="p-10 text-white text-center italic">Sincronizando...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20">
      {notificacion.visible && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-50 bg-blue-600 px-8 py-4 rounded-2xl shadow-2xl border-2 border-blue-400">
          <p className="text-white font-black uppercase text-center text-xs tracking-widest">{notificacion.mensaje}</p>
        </div>
      )}

      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30 flex justify-between items-center">
        <div>
          <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">Operador de Guardia</p>
          <h3 className="text-sm font-black uppercase">{perfilUsuario?.jerarquia} {perfilUsuario?.apellido}</h3>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-white uppercase italic">{piso?.nombre_piso}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
        <button onClick={() => setModo('piso')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'piso' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Entrega en Piso</button>
        <button onClick={() => setModo('lavadero')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'lavadero' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500'}`}>Recuento Lavadero</button>
      </div>

      <form onSubmit={enviarRegistro} className="space-y-4 bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl">
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Prenda</label>
          <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 font-black text-blue-300" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {modo === 'piso' ? (
          <>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Enfermero Receptor</label>
              <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm" value={datos.dni_enfermero} onChange={e => setDatos({...datos, dni_enfermero: e.target.value})} required>
                <option value="">Seleccionar responsable...</option>
                {enfermeros.map(enf => <option key={enf.dni} value={enf.dni}>{enf.apellido}</option>)}
              </select>
            </div>
            <div className="bg-slate-950 p-6 rounded-2xl border border-blue-900/30 text-center">
              <label className="text-[10px] font-black text-blue-500 uppercase block mb-2 tracking-widest">Entrega Limpio Piso</label>
              <input type="number" className="bg-transparent w-full text-5xl font-black outline-none text-center text-blue-400" value={datos.entrega_piso} onChange={e => setDatos({...datos, entrega_piso: e.target.value})} autoFocus />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-slate-950 p-6 rounded-2xl border border-green-900/30 text-center">
              <label className="text-[10px] font-black text-green-500 uppercase block mb-2">Carga Limpio (Desde Lavadero)</label>
              <input type="number" className="bg-transparent w-full text-5xl font-black outline-none text-green-400 text-center" value={datos.carga_lavadero} onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} />
            </div>
            <div className="bg-slate-950 p-6 rounded-2xl border border-red-900/30 text-center">
              <label className="text-[10px] font-black text-red-500 uppercase block mb-2">Recuento Sucio (Para Lavadero)</label>
              <input type="number" className="bg-transparent w-full text-5xl font-black outline-none text-red-400 text-center" value={datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
            </div>
          </div>
        )}

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
          <label className="text-[9px] font-black text-slate-500 uppercase block mb-1 text-center">Control Stock Físico en Estante</label>
          <input type="number" className="bg-transparent w-full text-2xl font-black outline-none text-center text-slate-400" value={datos.stock_fisico_piso} onChange={e => setDatos({...datos, stock_fisico_piso: e.target.value})} />
        </div>

        <button type="submit" className={`w-full p-5 rounded-2xl font-black uppercase text-sm ${modo === 'piso' ? 'bg-blue-600' : 'bg-green-600'}`}>Confirmar Movimiento</button>
      </form>

      {/* REGISTROS DEL TURNO ACTUAL */}
      {registrosSesion.length > 0 && (
        <div className="mt-8 space-y-2">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Manifiesto del Turno</p>
          {registrosSesion.map((reg, idx) => (
            <div key={idx} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex justify-between items-center animate-in fade-in slide-in-from-left-2">
              <div>
                <p className="text-xs font-black text-white">{reg.item}</p>
                <p className="text-[8px] text-slate-500 uppercase font-bold">{reg.hora} - {reg.enfermero_nom}</p>
              </div>
              <div className="flex gap-3">
                {reg.entregado_limpio > 0 && <span className="text-[10px] font-black text-green-500">+{reg.entregado_limpio}</span>}
                {reg.egreso_limpio > 0 && <span className="text-[10px] font-black text-blue-400">-{reg.egreso_limpio}</span>}
                {reg.retirado_sucio > 0 && <span className="text-[10px] font-black text-red-500">S:{reg.retirado_sucio}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FormularioPiso;