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
    item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, stock_fisico_piso: 0,
    dni_enfermero: '', comentarios: ''
  });

  useEffect(() => { cargarContexto(); }, [slugPiso]);

  const mostrarSplash = (mensaje) => {
    setNotificacion({ visible: true, mensaje });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 4000);
  };

  const cargarContexto = async () => {
    const { data: dataPiso } = await supabase.from('pisos').select('*').eq('slug', slugPiso).single();
    if (dataPiso) {
      setPiso(dataPiso);
      const { data: dataEnf } = await supabase.from('personal').select('*').eq('rol', 'enfermero').order('apellido');
      setEnfermeros(dataEnf || []);
    }
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    
    if (modo === 'piso' && !datos.dni_enfermero) return mostrarSplash("Seleccione Enfermero");

    const registroAInsertar = {
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: modo === 'piso' ? datos.dni_enfermero : null,
      item: datos.item,
      entregado_limpio: modo === 'piso' ? parseInt(datos.entrega_piso) : parseInt(datos.carga_lavadero),
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio || 0) : 0,
      stock_fisico_piso: parseInt(datos.stock_fisico_piso),
      comentarios: `MODO_${modo.toUpperCase()}`
    };

    const { error } = await supabase.from('movimientos_stock').insert([registroAInsertar]);

    if (error) {
      mostrarSplash(`Error: ${error.message}`);
    } else {
      mostrarSplash(`${datos.item} REGISTRADO`);
      setRegistrosSesion([{...registroAInsertar, hora: new Date().toLocaleTimeString()}, ...registrosSesion]);
      setDatos({ ...datos, carga_lavadero: 0, entrega_piso: 0, stock_fisico_piso: 0 });
    }
  };

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20">
      {/* HEADER DE OPERADOR */}
      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30 flex justify-between items-center">
        <div>
          <p className="text-[9px] text-blue-500 font-black uppercase tracking-[0.2em]">Operador en Guardia</p>
          <h3 className="text-sm font-black uppercase">
            {perfilUsuario?.jerarquia} {perfilUsuario?.apellido}, {perfilUsuario?.nombre}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Sector</p>
          <p className="text-xs font-bold text-white">{piso?.nombre_piso}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 bg-slate-900 p-1 rounded-2xl border border-slate-800">
        <button onClick={() => setModo('piso')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'piso' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Entrega a Piso</button>
        <button onClick={() => setModo('lavadero')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'lavadero' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500'}`}>Recuento Lavadero</button>
      </div>

      <form onSubmit={enviarRegistro} className="space-y-4 bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl mb-8">
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Prenda</label>
          <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 font-bold text-blue-300" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {modo === 'piso' ? (
          <>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block italic">Enfermero que recibe en Piso</label>
              <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm" value={datos.dni_enfermero} onChange={e => setDatos({...datos, dni_enfermero: e.target.value})} required>
                <option value="">Seleccionar responsable...</option>
                {enfermeros.map(enf => <option key={enf.dni} value={enf.dni}>{enf.apellido}, {enf.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <label className="text-[8px] font-black text-blue-500 uppercase block mb-1">Carga Limpio Lavadero</label>
                <input type="number" className="bg-transparent w-full text-2xl font-black outline-none" value={datos.carga_lavadero} onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} />
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <label className="text-[8px] font-black text-blue-400 uppercase block mb-1">Entrega Limpio Piso</label>
                <input type="number" className="bg-transparent w-full text-2xl font-black outline-none" value={datos.entrega_piso} onChange={e => setDatos({...datos, entrega_piso: e.target.value})} />
              </div>
            </div>
            <div className="bg-blue-900/10 p-4 rounded-2xl border border-blue-900/30">
              <label className="text-[9px] font-black text-blue-300 uppercase block mb-1 tracking-widest text-center">Stock Actual en Estante</label>
              <input type="number" className="bg-transparent w-full text-3xl font-black outline-none text-center" value={datos.stock_fisico_piso} onChange={e => setDatos({...datos, stock_fisico_piso: e.target.value})} />
            </div>
          </>
        ) : (
          <div className="bg-slate-950 p-6 rounded-2xl border border-green-900/30 text-center">
            <label className="text-[10px] font-black text-green-500 uppercase block mb-2">Recuento Sucio recolectado</label>
            <input type="number" className="bg-transparent w-full text-5xl font-black outline-none text-green-400 text-center" value={datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
          </div>
        )}

        <button type="submit" className={`w-full p-5 rounded-2xl font-black uppercase text-sm shadow-xl active:scale-95 transition-all ${modo === 'piso' ? 'bg-blue-600' : 'bg-green-600'}`}>
          Confirmar y Registrar Movimiento
        </button>
      </form>
    </div>
  );
};

export default FormularioPiso;