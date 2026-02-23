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
    try {
      const guardado = localStorage.getItem(`sentinel_manifiesto_${slugPiso}`);
      return guardado ? JSON.parse(guardado) : [];
    } catch (e) { return []; }
  });

  const [busquedaDni, setBusquedaDni] = useState('');
  const [enfermeroEncontrado, setEnfermeroEncontrado] = useState(null);
  
  const [datos, setDatos] = useState({
    item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0, stock_fisico_piso: 0
  });

  useEffect(() => {
    if (slugPiso) {
      localStorage.setItem(`sentinel_manifiesto_${slugPiso}`, JSON.stringify(registrosSesion));
    }
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
    if (data) {
      setEnfermeroEncontrado(data);
      mostrarSplash(`VALIDADO: ${data.jerarquia} ${data.apellido}`);
    } else {
      alert("DNI no registrado.");
    }
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    const hayMov = parseInt(datos.carga_lavadero) > 0 || parseInt(datos.entrega_piso) > 0 || parseInt(datos.retirado_sucio) > 0;
    
    if (!hayMov && !auditoriaHabilitada) return;
    if (modo === 'piso' && !enfermeroEncontrado && !auditoriaHabilitada) {
      alert("Falta validar DNI receptor");
      return;
    }

    let nuevoStock = stockActual;
    if (modo === 'piso') nuevoStock -= parseInt(datos.entrega_piso || 0);
    if (modo === 'lavadero') nuevoStock += parseInt(datos.carga_lavadero || 0);

    const stockFinal = auditoriaHabilitada ? parseInt(datos.stock_fisico_piso) : nuevoStock;

    const { error } = await supabase.from('movimientos_stock').insert([{
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: modo === 'piso' ? enfermeroEncontrado?.dni : null,
      item: datos.item,
      entregado_limpio: modo === 'lavadero' ? parseInt(datos.carga_lavadero) : 0,
      egreso_limpio: modo === 'piso' ? parseInt(datos.entrega_piso) : 0,
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio) : 0,
      stock_fisico_piso: stockFinal
    }]);

    if (!error) {
      const nuevoMov = {
        item: datos.item,
        hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        operador: `${perfilUsuario.jerarquia} ${perfilUsuario.apellido} ${perfilUsuario.nombre}`,
        receptor: auditoriaHabilitada ? `SINC: ${stockFinal}` : (modo === 'piso' ? `${enfermeroEncontrado.jerarquia} ${enfermeroEncontrado.apellido} ${enfermeroEncontrado.nombre}` : 'LAVADERO'),
        // Lógica de signos solicitada
        valor: auditoriaHabilitada ? stockFinal : (parseInt(datos.carga_lavadero) || -parseInt(datos.entrega_piso) || -parseInt(datos.retirado_sucio)),
        esSincro: auditoriaHabilitada
      };
      
      setRegistrosSesion(prev => [nuevoMov, ...prev]);
      mostrarSplash(auditoriaHabilitada ? "STOCK SINCRONIZADO" : "REGISTRO EXITOSO");
      setDatos({ ...datos, carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
      setBusquedaDni(''); setEnfermeroEncontrado(null); cargarContexto();
    }
  };

  const bajarPDF = () => {
    const fecha = new Date().toLocaleDateString();
    let txt = `SENTINEL HNPM - REPORTE DE GUARDIA\nSECTOR: ${piso.nombre_piso}\n${'='.repeat(40)}\n`;
    registrosSesion.forEach(r => {
      txt += `[${r.hora}] ${r.item}: ${r.valor > 0 ? '+' : ''}${r.valor}\nOP: ${r.operador}\nREC: ${r.receptor}\n${'-'.repeat(40)}\n`;
    });
    const blob = new Blob([txt], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Guardia_${piso.slug}_${fecha}.txt`;
    link.click();
  };

  if (!piso) return <div className="p-10 text-white text-center italic">Cargando...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20 font-sans">
      
      {/* SPLASH DE CONFIRMACIÓN */}
      {notificacion.visible && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-blue-600 border-2 border-blue-400 p-8 rounded-[3rem] shadow-2xl animate-in zoom-in duration-300 text-center max-w-xs w-full">
            <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-black uppercase text-xs tracking-widest">{notificacion.mensaje}</p>
          </div>
        </div>
      )}

      {/* Identidad */}
      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30 flex justify-between items-center">
        <div>
          <p className="text-[9px] text-blue-500 font-black uppercase">Operador HNPM</p>
          <h3 className="text-sm font-black uppercase">{perfilUsuario?.jerarquia} {perfilUsuario?.apellido}</h3>
        </div>
        <p className="text-xs font-bold text-white uppercase italic">{piso?.nombre_piso}</p>
      </div>

      <form onSubmit={enviarRegistro} className="space-y-4">
        <select className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 font-black text-blue-400" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
          {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
        </select>

        <div className={`p-6 rounded-[2.5rem] border transition-all text-center ${auditoriaHabilitada ? 'bg-yellow-900/20 border-yellow-500/50' : 'bg-slate-900 border-slate-800'}`}>
          <p className="text-[10px] font-black uppercase mb-1 text-slate-500">
            {auditoriaHabilitada ? '⚠️ MODO AJUSTE HABILITADO' : 'STOCK DISPONIBLE EN PISO'}
          </p>
          <input 
            type="number" readOnly={!auditoriaHabilitada}
            className={`bg-transparent w-full text-5xl font-black text-center outline-none ${auditoriaHabilitada ? 'text-yellow-400' : 'text-white'}`}
            value={auditoriaHabilitada ? datos.stock_fisico_piso : stockActual}
            onChange={(e) => setDatos({...datos, stock_fisico_piso: e.target.value})}
          />
        </div>

        {!auditoriaHabilitada && (
          <div className="flex gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
            <button type="button" onClick={() => setModo('piso')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase ${modo === 'piso' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Entrega en Piso</button>
            <button type="button" onClick={() => setModo('lavadero')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase ${modo === 'lavadero' ? 'bg-green-600 text-white' : 'text-slate-500'}`}>Recuento Lavadero</button>
          </div>
        )}

        {modo === 'piso' && !auditoriaHabilitada ? (
          <div className="bg-blue-900/10 p-5 rounded-[2rem] border border-blue-900/30 space-y-4">
            <div className="flex gap-2">
              <input type="number" className="flex-grow bg-slate-800 p-3 rounded-xl text-sm border border-slate-700 outline-none" placeholder="DNI Receptor..." value={busquedaDni} onChange={e => setBusquedaDni(e.target.value)} />
              <button type="button" onClick={buscarEnfermero} className="bg-blue-700 px-4 rounded-xl text-[10px] font-black">VALIDAR</button>
            </div>
            {enfermeroEncontrado && <p className="text-[9px] font-black text-blue-300 uppercase text-center">{enfermeroEncontrado.jerarquia} {enfermeroEncontrado.apellido}</p>}
            <input type="number" className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-blue-400 outline-none" placeholder="0" value={datos.entrega_piso} onChange={e => setDatos({...datos, entrega_piso: e.target.value})} />
          </div>
        ) : !auditoriaHabilitada ? (
          <div className="space-y-4">
            <div className="bg-green-900/10 p-5 rounded-[2rem] border border-green-900/30 text-center">
              <label className="text-[10px] font-black text-green-500 uppercase block mb-1">Carga Limpia</label>
              <input type="number" className="bg-transparent w-full text-5xl font-black text-green-400 outline-none text-center" value={datos.carga_lavadero} onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} />
            </div>
            <div className="bg-red-900/10 p-5 rounded-[2rem] border border-red-900/30 text-center">
              <label className="text-[10px] font-black text-red-500 uppercase block mb-1">Ropa Sucia</label>
              <input type="number" className="bg-transparent w-full text-5xl font-black text-red-400 outline-none text-center" value={datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
            </div>
          </div>
        ) : null}

        <button type="submit" className={`w-full p-5 rounded-3xl font-black uppercase text-sm ${auditoriaHabilitada ? 'bg-yellow-600' : modo === 'piso' ? 'bg-blue-600' : 'bg-green-600'}`}>
          {auditoriaHabilitada ? 'Sincronizar Stock' : 'Confirmar Movimiento'}
        </button>
      </form>

      {/* MANIFIESTO MATEMÁTICO SIMPLIFICADO */}
      {registrosSesion.length > 0 && (
        <div className="mt-10 space-y-3">
          <div className="flex justify-between items-center px-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Manifiesto de Guardia</p>
            <button onClick={bajarPDF} className="p-2 bg-slate-900 rounded-full border border-slate-800 text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto max-h-[300px] space-y-2 pr-1 custom-scroll">
            {registrosSesion.map((reg, idx) => (
              <div key={idx} className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 flex justify-between items-center">
                <div className="w-1/2">
                  <p className={`text-[11px] font-black uppercase ${reg.esSincro ? 'text-yellow-500' : 'text-white'}`}>{reg.item}</p>
                  <p className="text-[8px] text-slate-500 font-bold uppercase">{reg.hora} - OP: {reg.operador.split(' ').slice(0, 2).join(' ')}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-black ${reg.valor > 0 ? 'text-green-500' : reg.esSincro ? 'text-yellow-500' : 'text-red-500'}`}>
                    {reg.valor > 0 ? '+' : ''}{reg.valor}
                  </p>
                  <p className="text-[7px] text-slate-600 font-black uppercase">REC: {reg.receptor.split(' ').slice(0, 2).join(' ')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FormularioPiso;