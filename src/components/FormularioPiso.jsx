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
      // Lógica de Doble Entrada:
      entregado_limpio: modo === 'piso' ? parseInt(datos.entrega_piso) : parseInt(datos.carga_lavadero),
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio) : 0,
      stock_fisico_piso: parseInt(datos.stock_fisico_piso),
      comentarios: `OP_${modo.toUpperCase()}`
    };

    const { error } = await supabase.from('movimientos_stock').insert([registroAInsertar]);

    if (error) {
      mostrarSplash(`Error: ${error.message}`);
    } else {
      mostrarSplash(`${datos.item} REGISTRADO CORRECTAMENTE`);
      setDatos({ ...datos, carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0, stock_fisico_piso: 0 });
    }
  };

  if (!piso) return <div className="p-10 text-white text-center italic">Sincronizando con el sector...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20">
      {notificacion.visible && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-50 bg-blue-600 px-8 py-4 rounded-2xl shadow-2xl border-2 border-blue-400">
          <p className="text-white font-black uppercase text-center text-xs tracking-widest">{notificacion.mensaje}</p>
        </div>
      )}

      {/* IDENTIDAD DEL OPERADOR */}
      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30 flex justify-between items-center shadow-lg">
        <div>
          <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest leading-none">Operador de Guardia</p>
          <h3 className="text-sm font-black uppercase mt-1">
            {perfilUsuario?.jerarquia} {perfilUsuario?.apellido}, {perfilUsuario?.nombre}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none">Sector</p>
          <p className="text-xs font-bold text-white mt-1 uppercase italic">{piso?.nombre_piso}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
        <button onClick={() => setModo('piso')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'piso' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Entrega en Piso</button>
        <button onClick={() => setModo('lavadero')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'lavadero' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500'}`}>Recuento Lavadero</button>
      </div>

      <form onSubmit={enviarRegistro} className="space-y-4 bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl">
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Tipo de Prenda</label>
          <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 font-black text-blue-300" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {modo === 'piso' ? (
          <>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Enfermero Responsable</label>
              <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm" value={datos.dni_enfermero} onChange={e => setDatos({...datos, dni_enfermero: e.target.value})} required>
                <option value="">Seleccionar...</option>
                {enfermeros.map(enf => <option key={enf.dni} value={enf.dni}>{enf.apellido}, {enf.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
                <label className="text-[8px] font-black text-blue-500 uppercase block mb-1 leading-none">Carga Limpio<br/>Lavadero</label>
                <input type="number" className="bg-transparent w-full text-2xl font-black outline-none text-center" value={datos.carga_lavadero} onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} />
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
                <label className="text-[8px] font-black text-blue-400 uppercase block mb-1 leading-none">Entrega Limpio<br/>Piso</label>
                <input type="number" className="bg-transparent w-full text-2xl font-black outline-none text-center" value={datos.entrega_piso} onChange={e => setDatos({...datos, entrega_piso: e.target.value})} />
              </div>
            </div>
            <div className="bg-blue-900/10 p-4 rounded-2xl border border-blue-900/30 text-center">
              <label className="text-[10px] font-black text-blue-400 uppercase block mb-1 tracking-widest">Stock Actual en Estante</label>
              <input type="number" className="bg-transparent w-full text-3xl font-black outline-none text-center text-blue-100" value={datos.stock_fisico_piso} onChange={e => setDatos({...datos, stock_fisico_piso: e.target.value})} />
            </div>
          </>
        ) : (
          <div className="bg-slate-950 p-8 rounded-2xl border border-green-900/30 text-center">
            <label className="text-[10px] font-black text-green-500 uppercase block mb-2 tracking-widest">Recuento Físico Sucio</label>
            <input type="number" className="bg-transparent w-full text-6xl font-black outline-none text-green-400 text-center" value={datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} autoFocus />
            <p className="text-[9px] text-slate-600 mt-6 font-bold uppercase tracking-tighter">Bolsa recolectada del {piso?.nombre_piso}</p>
          </div>
        )}

        <button type="submit" className={`w-full p-5 rounded-2xl font-black uppercase text-sm shadow-xl transition-all active:scale-95 ${modo === 'piso' ? 'bg-blue-600 shadow-blue-900/30' : 'bg-green-600 shadow-green-900/30'}`}>
          Confirmar Movimiento
        </button>
      </form>
    </div>
  );
};

export default FormularioPiso;