import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

const FormularioPiso = ({ perfilUsuario, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [modo, setModo] = useState('piso'); 
  const [stockActual, setStockActual] = useState(0);
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  
  const [registrosSesion, setRegistrosSesion] = useState(() => {
    const guardado = localStorage.getItem(`manifiesto_${slugPiso}`);
    return guardado ? JSON.parse(guardado) : [];
  });

  const [busquedaDni, setBusquedaDni] = useState('');
  const [enfermeroEncontrado, setEnfermeroEncontrado] = useState(null);
  
  const [datos, setDatos] = useState({
    item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0, stock_fisico_piso: 0
  });

  useEffect(() => {
    localStorage.setItem(`manifiesto_${slugPiso}`, JSON.stringify(registrosSesion));
  }, [registrosSesion, slugPiso]);

  useEffect(() => {
    cargarContexto();
  }, [slugPiso, datos.item]);

  const cargarContexto = async () => {
    const { data: dataPiso } = await supabase.from('pisos').select('*').eq('slug', slugPiso).single();
    if (dataPiso) {
      setPiso(dataPiso);
      const { data: mov } = await supabase.from('movimientos_stock').select('stock_fisico_piso').eq('piso_id', dataPiso.id).eq('item', datos.item).order('created_at', { ascending: false }).limit(1).single();
      const stockFisico = mov ? mov.stock_fisico_piso : 0;
      setStockActual(stockFisico);
      
      // Si el modo ajuste está activo, pre-cargamos el valor actual para editarlo
      setDatos(prev => ({ ...prev, stock_fisico_piso: stockFisico }));

      const { data: config } = await supabase.from('configuracion_sistema').select('valor').eq('clave', 'MODO_AUDITORIA').single();
      setAuditoriaHabilitada(config?.valor === 'true');
    }
  };

  const mostrarSplash = (mensaje) => {
    setNotificacion({ visible: true, mensaje });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  const buscarEnfermero = async () => {
    if (busquedaDni.length < 7) return;
    const { data } = await supabase.from('personal').select('*').eq('dni', busquedaDni).eq('rol', 'enfermero').single();
    if (data) setEnfermeroEncontrado(data);
    else alert("Personal de enfermería no hallado.");
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();

    // LÓGICA DE AUDITORÍA: Si el modo está activo, permitimos registrar sin cantidades de flujo
    if (auditoriaHabilitada) {
      const { error } = await supabase.from('movimientos_stock').insert([{
        piso_id: piso.id,
        dni_pañolero: perfilUsuario.dni,
        dni_enfermero: null, // Auditoría no requiere receptor
        item: datos.item,
        entregado_limpio: 0,
        egreso_limpio: 0,
        retirado_sucio: 0,
        stock_fisico_piso: parseInt(datos.stock_fisico_piso)
      }]);

      if (!error) {
        mostrarSplash(`AUDITORÍA: ${datos.item} SINCRONIZADO`);
        setRegistrosSesion([{
          item: datos.item,
          hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          operador: `${perfilUsuario.apellido} (JEFE)`,
          receptor: 'SINCRONIZACIÓN DE STOCK',
          limpio: 0, entrega: 0, sucio: 0
        }, ...registrosSesion]);
        cargarContexto();
      }
      return;
    }

    // FLUJO NORMAL (Si auditoría está OFF)
    const hayMovimiento = parseInt(datos.carga_lavadero) > 0 || parseInt(datos.entrega_piso) > 0 || parseInt(datos.retirado_sucio) > 0;
    if (!hayMovimiento) {
      alert("Error: No se detectaron cantidades para el movimiento.");
      return;
    }

    if (modo === 'piso' && !enfermeroEncontrado) {
      alert("Requisito: Debe validar un enfermero receptor.");
      return;
    }

    let nuevoStock = stockActual;
    if (modo === 'piso') nuevoStock -= parseInt(datos.entrega_piso || 0);
    if (modo === 'lavadero') nuevoStock += parseInt(datos.carga_lavadero || 0);

    const { error } = await supabase.from('movimientos_stock').insert([{
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: modo === 'piso' ? enfermeroEncontrado.dni : null,
      item: datos.item,
      entregado_limpio: modo === 'lavadero' ? parseInt(datos.carga_lavadero) : 0,
      egreso_limpio: modo === 'piso' ? parseInt(datos.entrega_piso) : 0,
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio) : 0,
      stock_fisico_piso: nuevoStock
    }]);

    if (!error) {
      const nuevoMov = {
        item: datos.item,
        hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        operador: perfilUsuario.apellido,
        receptor: modo === 'piso' ? enfermeroEncontrado.apellido : 'LAVADERO',
        limpio: modo === 'lavadero' ? datos.carga_lavadero : 0,
        entrega: modo === 'piso' ? datos.entrega_piso : 0,
        sucio: modo === 'lavadero' ? datos.retirado_sucio : 0
      };
      setRegistrosSesion([nuevoMov, ...registrosSesion]);
      mostrarSplash('REGISTRO EXITOSO');
      setDatos({ ...datos, carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
      setBusquedaDni('');
      setEnfermeroEncontrado(null);
      cargarContexto();
    }
  };

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20 font-sans">
      
      {/* Splash de Confirmación */}
      {notificacion.visible && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] px-6">
          <div className="bg-blue-600 border-2 border-blue-400 p-8 rounded-[2.5rem] shadow-2xl animate-in zoom-in duration-300 text-center">
             <p className="text-white font-black uppercase text-sm tracking-widest">{notificacion.mensaje}</p>
          </div>
        </div>
      )}

      {/* Header Identidad */}
      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30 flex justify-between items-center shadow-lg">
        <div>
          <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest leading-none">HNPM - Operador</p>
          <h3 className="text-sm font-black uppercase mt-1">{perfilUsuario?.jerarquia} {perfilUsuario?.apellido}</h3>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-white uppercase italic tracking-tighter">{piso?.nombre_piso}</p>
        </div>
      </div>

      {/* Solo mostramos selector de modo si la auditoría está OFF */}
      {!auditoriaHabilitada && (
        <div className="flex gap-2 mb-6 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-xl">
          <button onClick={() => setModo('piso')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'piso' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Entrega en Piso</button>
          <button onClick={() => setModo('lavadero')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'lavadero' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500'}`}>Recuento Lavadero</button>
        </div>
      )}

      <form onSubmit={enviarRegistro} className="space-y-4">
        <select className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 font-black text-blue-400 outline-none" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
          {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
        </select>

        {/* STOCK DISPONIBLE EN PISO */}
        <div className={`p-6 rounded-[2.5rem] border transition-all duration-500 text-center shadow-inner ${auditoriaHabilitada ? 'bg-yellow-900/40 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'bg-slate-900 border-slate-800'}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${auditoriaHabilitada ? 'text-yellow-400 animate-pulse' : 'text-slate-500'}`}>
            {auditoriaHabilitada ? '⚠️ RECUENTO FÍSICO DE AUDITORÍA' : 'STOCK DISPONIBLE EN PISO'}
          </p>
          <input 
            type="number" 
            readOnly={!auditoriaHabilitada}
            className={`bg-transparent w-full text-6xl font-black text-center outline-none ${auditoriaHabilitada ? 'text-yellow-400' : 'text-white'}`}
            value={auditoriaHabilitada ? datos.stock_fisico_piso : stockActual}
            onChange={(e) => setDatos({...datos, stock_fisico_piso: e.target.value})}
          />
          {auditoriaHabilitada && (
            <p className="text-[9px] text-yellow-600 font-black mt-2 uppercase">Modifique el valor según lo que observa en el estante</p>
          )}
        </div>

        {!auditoriaHabilitada ? (
          modo === 'piso' ? (
            <div className="bg-blue-900/10 p-5 rounded-[2rem] border border-blue-900/30 space-y-4 shadow-2xl">
              <div className="flex gap-2">
                <input type="number" className="flex-grow bg-slate-800 p-3 rounded-xl text-sm border border-slate-700 font-bold outline-none" placeholder="DNI Enfermero..." value={busquedaDni} onChange={e => setBusquedaDni(e.target.value)} />
                <button type="button" onClick={buscarEnfermero} className="bg-blue-700 px-4 rounded-xl text-[10px] font-black uppercase">Validar</button>
              </div>
              {enfermeroEncontrado && (
                <div className="bg-blue-600/20 p-3 rounded-xl border border-blue-500/50">
                  <p className="text-[10px] font-black text-blue-300 uppercase leading-none">RECEPTOR: {enfermeroEncontrado.jerarquia} {enfermeroEncontrado.apellido}</p>
                </div>
              )}
              <input type="number" className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-blue-400 outline-none" placeholder="0" value={datos.entrega_piso} onChange={e => setDatos({...datos, entrega_piso: e.target.value})} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-900/10 p-5 rounded-[2rem] border border-green-900/30">
                <label className="text-[10px] font-black text-green-500 uppercase block text-center mb-2 italic tracking-widest">Carga Limpia Recibida</label>
                <input type="number" className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-green-400 outline-none" value={datos.carga_lavadero} onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} />
              </div>
              <div className="bg-red-900/10 p-5 rounded-[2rem] border border-red-900/30">
                <label className="text-[10px] font-black text-red-500 uppercase block text-center mb-2 italic tracking-widest">Recuento Sucio Enviado</label>
                <input type="number" className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-red-400 outline-none" value={datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
              </div>
            </div>
          )
        ) : null}

        <button type="submit" className={`w-full p-5 rounded-3xl font-black uppercase text-sm shadow-2xl transition-all ${auditoriaHabilitada ? 'bg-yellow-600 text-white' : modo === 'piso' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
          {auditoriaHabilitada ? 'Fijar Stock de Auditoría' : 'Confirmar Movimiento'}
        </button>
      </form>

      {/* Manifiesto Compacto */}
      {registrosSesion.length > 0 && (
        <div className="mt-8 overflow-y-auto max-h-[300px]">
           {/* ... Estructura de tabla idéntica ... */}
        </div>
      )}
    </div>
  );
};

export default FormularioPiso;