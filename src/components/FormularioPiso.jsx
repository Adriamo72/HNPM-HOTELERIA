import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

const FormularioPiso = ({ perfilUsuario, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [modo, setModo] = useState('piso'); 
  const [stockActual, setStockActual] = useState(0);
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '', tipo: 'exito' });
  
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

  useEffect(() => {
    const buscarEnfermeroAuto = async () => {
      if (busquedaDni.length >= 7) {
        const { data } = await supabase.from('personal').select('*').eq('dni', busquedaDni).eq('rol', 'enfermero').single();
        if (data) {
          setEnfermeroEncontrado(data);
          mostrarSplash(`VALIDADO: ${data.jerarquia} ${data.apellido}`, 'exito');
        } else {
          setEnfermeroEncontrado(null);
        }
      } else {
        setEnfermeroEncontrado(null);
      }
    };
    buscarEnfermeroAuto();
  }, [busquedaDni]);

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

  const mostrarSplash = (mensaje, tipo = 'exito') => {
    setNotificacion({ visible: true, mensaje, tipo });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '', tipo: 'exito' }), 2200);
  };

  const limpiarManifiesto = () => {
    if (window.confirm("¿Cerrar guardia y limpiar manifiesto?")) {
      setRegistrosSesion([]);
      localStorage.removeItem(`sentinel_manifiesto_${slugPiso}`);
      mostrarSplash("MANIFIESTO REINICIADO", "exito");
    }
  };

  // FUNCIÓN PARA DESCARGAR MANIFIESTO EN PDF
  const descargarPDF = () => {
    const win = window.open('', '_blank');
    const fecha = new Date().toLocaleDateString('es-AR');
    
    let filas = registrosSesion.map(r => `
      <tr>
        <td>${r.item}</td>
        <td>${r.hora}</td>
        <td>${r.valor > 0 ? '+' : ''}${r.valor}</td>
        <td>${r.receptor}</td>
        <td>${r.operador}</td>
      </tr>
    `).join('');

    win.document.write(`
      <html>
        <head>
          <title>Manifiesto - ${piso.nombre_piso}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; padding-bottom: 10px; }
            .header h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
            .header p { margin: 5px 0; font-size: 12px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 10px; text-align: left; font-size: 11px; }
            th { background-color: #f4f4f4; text-transform: uppercase; }
            .footer { margin-top: 50px; font-size: 10px; text-align: center; color: #777; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Manifiesto de Movimientos - ${piso.nombre_piso}</h1>
            <p>Dpto. Hotelería (Subdirección Administrativa) - Fecha: ${fecha}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ítem</th>
                <th>Hora</th>
                <th>Cant.</th>
                <th>Receptor / Destino</th>
                <th>Operador Pañol</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
          <div class="footer">
            Generado por Sistema Sentinel HNPM - Documento de Control Interno
          </div>
          <script>
            setTimeout(() => { window.print(); window.close(); }, 500);
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    const hayMov = parseInt(datos.carga_lavadero) > 0 || parseInt(datos.entrega_piso) > 0 || parseInt(datos.retirado_sucio) > 0;
    
    if (!hayMov && !auditoriaHabilitada) {
      mostrarSplash("INGRESE CANTIDADES", "error");
      return;
    }

    if (modo === 'piso' && !enfermeroEncontrado && !auditoriaHabilitada) {
      mostrarSplash("DNI RECEPTOR REQUERIDO", "error");
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
        operador: `${perfilUsuario.jerarquia} ${perfilUsuario.apellido}`,
        receptor: auditoriaHabilitada ? `SINC: ${stockFinal}` : (modo === 'piso' ? `${enfermeroEncontrado.jerarquia} ${enfermeroEncontrado.apellido}` : 'LAVADERO'),
        valor: auditoriaHabilitada ? stockFinal : (parseInt(datos.carga_lavadero) || -parseInt(datos.entrega_piso) || -parseInt(datos.retirado_sucio)),
        esSincro: auditoriaHabilitada
      };
      
      setRegistrosSesion(prev => [nuevoMov, ...prev]);
      mostrarSplash(auditoriaHabilitada ? "SINCRO EXITOSA" : "REGISTRO EXITOSO", "exito");
      setDatos({ ...datos, carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
      setBusquedaDni(''); setEnfermeroEncontrado(null); cargarContexto();
    }
  };

  if (!piso) return <div className="p-10 text-white text-center italic">Cargando...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20 font-sans">
      
      {notificacion.visible && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-slate-950/80 backdrop-blur-sm">
          <div className={`${notificacion.tipo === 'exito' ? 'bg-blue-600 border-blue-400' : 'bg-red-900 border-red-700'} border-2 p-8 rounded-[3rem] shadow-2xl text-center max-w-xs w-full animate-in zoom-in duration-300`}>
             <p className="text-white font-black uppercase text-xs tracking-widest">{notificacion.mensaje}</p>
          </div>
        </div>
      )}

      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30 flex justify-between items-center">
        <div>
          <p className="text-[9px] text-blue-500 font-black uppercase">Operador</p>
          <h3 className="text-sm font-black uppercase">{perfilUsuario?.jerarquia} {perfilUsuario?.apellido}</h3>
        </div>
        <p className="text-xs font-bold text-white uppercase italic">{piso?.nombre_piso}</p>
      </div>

      <form onSubmit={enviarRegistro} className="space-y-4">
        <select className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 font-black text-blue-400 outline-none" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
          {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
        </select>

        <div className={`p-6 rounded-[2.5rem] border text-center ${auditoriaHabilitada ? 'bg-yellow-900/20 border-yellow-500/50' : 'bg-slate-900 border-slate-800 shadow-lg'}`}>
          <p className="text-[10px] font-black uppercase mb-1 text-slate-500 tracking-widest">STOCK DISPONIBLE</p>
          <input 
            type="number" readOnly={!auditoriaHabilitada}
            className="bg-transparent w-full text-5xl font-black text-center outline-none"
            value={auditoriaHabilitada ? datos.stock_fisico_piso : stockActual}
            onChange={(e) => setDatos({...datos, stock_fisico_piso: e.target.value})}
          />
        </div>

        {!auditoriaHabilitada && (
          <div className="flex gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
            <button type="button" onClick={() => setModo('piso')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'piso' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Entrega Piso</button>
            <button type="button" onClick={() => setModo('lavadero')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'lavadero' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500'}`}>Entrega Sucio</button>
          </div>
        )}

        {modo === 'piso' && !auditoriaHabilitada ? (
          <div className="bg-blue-900/10 p-5 rounded-[2rem] border border-blue-900/30 space-y-4">
            <input type="number" className="w-full bg-slate-800 p-4 rounded-xl text-sm border border-slate-700 outline-none font-bold" placeholder="DNI Receptor..." value={busquedaDni} onChange={e => setBusquedaDni(e.target.value)} />
            {enfermeroEncontrado && (
                <div className="p-3 bg-blue-600/20 rounded-xl border border-blue-500/50">
                  <p className="text-[10px] font-black text-blue-300 uppercase text-center">{enfermeroEncontrado.jerarquia} {enfermeroEncontrado.apellido}</p>
                </div>
            )}
            <input type="number" className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-blue-400 outline-none border border-blue-900/20" placeholder="CANTIDAD" value={datos.entrega_piso === 0 ? "" : datos.entrega_piso} onChange={e => setDatos({...datos, entrega_piso: e.target.value})} />
          </div>
        ) : !auditoriaHabilitada ? (
          <div className="space-y-4 animate-in slide-in-from-top-2">
            <div className="bg-green-900/10 p-5 rounded-[2rem] border border-green-900/30 text-center">
              <label className="text-[10px] font-black text-green-500 uppercase block mb-1">INGRESO LIMPIO</label>
              <input type="number" placeholder="CANTIDAD" className="bg-transparent w-full text-5xl font-black text-green-400 outline-none text-center" value={datos.carga_lavadero === 0 ? "" : datos.carga_lavadero} onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} />
            </div>
            <div className="bg-red-900/10 p-5 rounded-[2rem] border border-red-900/30 text-center">
              <label className="text-[10px] font-black text-red-500 uppercase block mb-1">RETIRO SUCIO</label>
              <input type="number" placeholder="CANTIDAD" className="bg-transparent w-full text-5xl font-black text-red-400 outline-none text-center" value={datos.retirado_sucio === 0 ? "" : datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
            </div>
          </div>
        ) : null}

        <button type="submit" className={`w-full p-5 rounded-3xl font-black uppercase text-sm shadow-2xl transition-all active:scale-95 ${auditoriaHabilitada ? 'bg-yellow-600 text-black' : modo === 'piso' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
          {auditoriaHabilitada ? 'Sincronizar Stock' : 'Confirmar Registro'}
        </button>
      </form>

      {registrosSesion.length > 0 && (
        <div className="mt-10 space-y-3 animate-in fade-in">
          <div className="flex justify-between items-center px-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Manifiesto de Guardia</p>
            <div className="flex gap-2">
              {/* BOTÓN PDF */}
              <button onClick={descargarPDF} title="Descargar PDF" className="p-2.5 bg-slate-900 rounded-full border border-blue-900/50 text-blue-400 hover:bg-blue-900/20 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button onClick={limpiarManifiesto} title="Limpiar Manifiesto" className="p-2.5 bg-slate-900 rounded-full border border-red-900/50 text-red-500 hover:bg-red-900/20 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
          <div className="overflow-y-auto max-h-[350px] space-y-2 pr-1 custom-scroll">
            {registrosSesion.map((reg, idx) => (
              <div key={idx} className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 flex justify-between items-center shadow-md">
                <div className="w-1/2">
                  <p className={`text-[11px] font-black uppercase ${reg.esSincro ? 'text-yellow-500' : 'text-white'}`}>{reg.item}</p>
                  <p className="text-[8px] text-slate-500 font-bold uppercase">{reg.hora} - OP: {reg.operador}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-black ${reg.valor > 0 ? 'text-green-500' : reg.esSincro ? 'text-yellow-500' : 'text-red-500'}`}>
                    {reg.valor > 0 ? '+' : ''}{reg.valor}
                  </p>
                  <p className="text-[7px] text-slate-600 font-black uppercase">REC: {reg.receptor}</p>
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