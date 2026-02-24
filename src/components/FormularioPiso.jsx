import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

const FormularioPiso = ({ perfilUsuario, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [enfermeros, setEnfermeros] = useState([]);
  const [modo, setModo] = useState('piso'); 
  const [stockActual, setStockActual] = useState(0);
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [registrosSesion, setRegistrosSesion] = useState([]);
  
  const [datos, setDatos] = useState({
    item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0, stock_fisico_piso: 0,
    dni_enfermero: ''
  });

  useEffect(() => {
    cargarContexto();
  }, [slugPiso, datos.item]);

  const cargarContexto = async () => {
    const { data: dataPiso } = await supabase.from('pisos').select('*').eq('slug', slugPiso).single();
    if (dataPiso) {
      setPiso(dataPiso);
      const { data: dataEnf } = await supabase.from('personal').select('*').eq('rol', 'enfermero').order('apellido');
      setEnfermeros(dataEnf || []);
      
      const { data: mov } = await supabase.from('movimientos_stock').select('stock_fisico_piso').eq('piso_id', dataPiso.id).eq('item', datos.item).order('created_at', { ascending: false }).limit(1).single();
      setStockActual(mov ? mov.stock_fisico_piso : 0);

      const { data: config } = await supabase.from('configuracion_sistema').select('valor').eq('clave', 'MODO_AUDITORIA').single();
      setAuditoriaHabilitada(config?.valor === 'true');
    }
  };

  const mostrarSplash = (mensaje) => {
    setNotificacion({ visible: true, mensaje });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    
    let nuevoStock = stockActual;
    if (modo === 'piso') nuevoStock -= parseInt(datos.entrega_piso || 0);
    if (modo === 'lavadero') nuevoStock += parseInt(datos.carga_lavadero || 0);

    const stockFinal = (auditoriaHabilitada && datos.stock_fisico_piso > 0) ? parseInt(datos.stock_fisico_piso) : nuevoStock;

    const { error } = await supabase.from('movimientos_stock').insert([{
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: modo === 'piso' ? datos.dni_enfermero : null,
      item: datos.item,
      entregado_limpio: modo === 'lavadero' ? parseInt(datos.carga_lavadero) : 0,
      egreso_limpio: modo === 'piso' ? parseInt(datos.entrega_piso) : 0,
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio) : 0,
      stock_fisico_piso: stockFinal
    }]);

    if (!error) {
      const nuevoMov = { ...datos, hora: new Date().toLocaleTimeString(), enfermero_nom: enfermeros.find(en => en.dni === datos.dni_enfermero)?.apellido || 'LAVADERO' };
      setRegistrosSesion([nuevoMov, ...registrosSesion]);
      setDatos({ ...datos, carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0, stock_fisico_piso: 0 });
      cargarContexto();
      mostrarSplash('REGISTRO EXITOSO');
    }
  };

  if (!piso) return <div className="p-10 text-white text-center italic">Sincronizando...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20 font-sans">
      {notificacion.visible && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-50 bg-blue-600 px-8 py-4 rounded-2xl shadow-2xl border-2 border-blue-400">
          <p className="text-white font-black uppercase text-center text-xs tracking-widest">{notificacion.mensaje}</p>
        </div>
      )}

      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30 flex justify-between items-center shadow-lg">
        <div>
          <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest leading-none">Operador</p>
          <h3 className="text-sm font-black uppercase mt-1">{perfilUsuario?.jerarquia} {perfilUsuario?.apellido}</h3>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-white uppercase italic">{piso?.nombre_piso}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-xl">
        <button onClick={() => setModo('piso')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'piso' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Entrega en Piso</button>
        <button onClick={() => setModo('lavadero')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'lavadero' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500'}`}>Recuento Lavadero</button>
      </div>

      <form onSubmit={enviarRegistro} className="space-y-4">
        <select className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 font-black text-blue-400" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
          {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
        </select>

        <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 text-center shadow-inner">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 italic">Stock Disponible en Estante</p>
          <p className="text-4xl font-black text-white">{stockActual}</p>
        </div>

        {modo === 'piso' ? (
          <div className="bg-blue-900/10 p-6 rounded-[2.5rem] border border-blue-900/30 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <select className="w-full bg-slate-800 p-3 rounded-xl text-sm border border-slate-700 font-bold" value={datos.dni_enfermero} onChange={e => setDatos({...datos, dni_enfermero: e.target.value})} required>
              <option value="">Enfermero Receptor...</option>
              {enfermeros.map(enf => <option key={enf.dni} value={enf.dni}>{enf.apellido}</option>)}
            </select>
            <label className="text-[9px] font-black text-blue-500 uppercase block text-center mb-1">Cantidad a entregar</label>
            <input type="number" className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-blue-400 outline-none" placeholder="0" value={datos.entrega_piso} onChange={e => setDatos({...datos, entrega_piso: e.target.value})} required />
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            <div className="bg-green-900/10 p-6 rounded-[2.5rem] border border-green-900/30">
              <label className="text-[10px] font-black text-green-500 uppercase block text-center mb-2 italic">Carga Limpia (Lavadero → Pañol)</label>
              <input type="number" className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-green-400 outline-none" value={datos.carga_lavadero} onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} />
            </div>
            <div className="bg-red-900/10 p-6 rounded-[2.5rem] border border-red-900/30">
              <label className="text-[10px] font-black text-red-500 uppercase block text-center mb-2 italic">Recuento Sucio (Pañol → Lavadero)</label>
              <input type="number" className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-red-400 outline-none" value={datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
            </div>
            {auditoriaHabilitada && (
              <div className="bg-yellow-600/10 p-6 rounded-[2.5rem] border border-yellow-600/50 shadow-2xl animate-bounce">
                <label className="text-[10px] font-black text-yellow-500 uppercase block text-center mb-2 tracking-tighter">⚠️ Mando de Auditoría: Sincronización Manual</label>
                <input type="number" className="w-full bg-transparent text-3xl text-center font-black text-yellow-200 outline-none" placeholder="Ingresar Stock Real..." value={datos.stock_fisico_piso} onChange={e => setDatos({...datos, stock_fisico_piso: e.target.value})} />
              </div>
            )}
          </div>
        )}
        <button type="submit" className={`w-full p-5 rounded-3xl font-black uppercase text-sm shadow-2xl transition-all active:scale-95 ${modo === 'piso' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>Confirmar Movimiento</button>
      </form>

      {registrosSesion.length > 0 && (
        <div className="mt-10 space-y-3">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Manifiesto de esta Guardia</p>
          {registrosSesion.map((reg, idx) => (
            <div key={idx} className="bg-slate-900/50 p-4 rounded-3xl border border-slate-800 flex justify-between items-center animate-in slide-in-from-left-4">
              <div>
                <p className="text-xs font-black text-white uppercase">{reg.item}</p>
                <p className="text-[8px] text-slate-500 uppercase font-bold">{reg.hora} - {reg.enfermero_nom}</p>
              </div>
              <div className="flex gap-4">
                {reg.carga_lavadero > 0 && <span className="text-[10px] font-black text-green-500">+{reg.carga_lavadero}</span>}
                {reg.entrega_piso > 0 && <span className="text-[10px] font-black text-blue-400">-{reg.entrega_piso}</span>}
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