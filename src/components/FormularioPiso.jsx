import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

const FormularioPiso = ({ perfilUsuario, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [modo, setModo] = useState('piso'); 
  const [stockActual, setStockActual] = useState(0);
  const [novedades, setNovedades] = useState("Sin novedades");
  const [busquedaDni, setBusquedaDni] = useState('');
  const [enfermeroEncontrado, setEnfermeroEncontrado] = useState(null);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [datos, setDatos] = useState({ item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/habitacion/')) setModo('habitacion');
    else if (path.includes('/lavadero/')) setModo('lavadero');
    else setModo('piso');
  }, []);

  useEffect(() => {
    if (slugPiso) cargarContexto();
  }, [slugPiso, datos.item]);

const cargarContextoPiso = async () => {
  let slugBuscar = slugPiso;
  
  // Si es habitación, el slug es "piso-1-medico", tenemos que sacar el piso
  if (window.location.pathname.includes('/habitacion/')) {
    // Esto toma "piso-1" del slug "piso-1-medico"
    const partes = slugPiso.split('-');
    slugBuscar = `${partes[0]}-${partes[1]}`; 
  }

  const { data, error } = await supabase
    .from('pisos')
    .select('*')
    .eq('slug', slugBuscar)
    .single();

  if (data) {
    setPiso(data);
    // Cargar stock...
  } else {
    console.error("No se encontró el sector para el slug:", slugBuscar);
  }
};

  const mostrarSplash = (msj) => {
    setNotificacion({ visible: true, mensaje: msj });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  const ejecutarCambioEstandar = async () => {
    const items = [
      { item: 'SABANAS', cant: 2 },
      { item: 'TOALLAS', cant: 1 },
      { item: 'TOALLONES', cant: 1 }
    ];

    for (const i of items) {
      await supabase.from('movimientos_stock').insert([{
        piso_id: piso.id,
        dni_pañolero: perfilUsuario.dni,
        item: i.item,
        egreso_limpio: i.cant,
        retirado_sucio: i.cant, // Asumimos retiro, si no está se anota en novedades
        novedades: novedades
      }]);
    }
    mostrarSplash("CAMBIO ESTÁNDAR REGISTRADO");
    cargarContexto();
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('movimientos_stock').insert([{
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: modo === 'piso' ? enfermeroEncontrado?.dni : null,
      item: datos.item,
      entregado_limpio: modo === 'lavadero' ? parseInt(datos.carga_lavadero || 0) : 0,
      egreso_limpio: modo === 'piso' ? parseInt(datos.entrega_piso || 0) : 0,
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio || 0) : 0,
      stock_fisico_piso: stockActual + (parseInt(datos.carga_lavadero || 0)) - (parseInt(datos.entrega_piso || 0))
    }]);

    if (!error) {
      mostrarSplash("REGISTRO EXITOSO");
      setDatos({ ...datos, carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
      cargarContexto();
    }
  };

  if (!piso) return <div className="p-10 text-white text-center italic">Cargando Sentinel...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20 font-sans">
      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30">
        <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">
          {modo === 'habitacion' ? 'SERVICIO HABITACIÓN' : modo === 'lavadero' ? 'CONTROL LAVADERO' : 'CONTROL PAÑOL'}
        </p>
        <h3 className="text-sm font-black uppercase">{piso.nombre_piso}</h3>
      </div>

      {modo === 'habitacion' ? (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Informe de Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-blue-400 outline-none"
              rows="3" placeholder="Ej: No se encontró toallón sucio..."
              value={novedades} onChange={(e) => setNovedades(e.target.value)}
            />
          </div>
          <button onClick={ejecutarCambioEstandar} className="w-full bg-blue-600 p-8 rounded-[2.5rem] font-black uppercase text-sm shadow-2xl active:scale-95 transition-all">
            Registrar Cambio Estándar
          </button>
        </div>
      ) : (
        <form onSubmit={enviarRegistro} className="space-y-4">
          <select className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 font-black text-blue-400 outline-none" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>

          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 text-center">
            <p className="text-[10px] font-black uppercase mb-1 text-slate-500">STOCK DISPONIBLE</p>
            <span className="text-5xl font-black text-blue-400">{stockActual}</span>
          </div>

          {modo === 'lavadero' ? (
            <div className="space-y-4">
              <div className="bg-green-900/10 p-5 rounded-[2rem] border border-green-900/30 text-center">
                <label className="text-[10px] font-black text-green-500 uppercase block mb-1">INGRESO LIMPIO</label>
                <input type="number" className="bg-transparent w-full text-5xl font-black text-green-400 outline-none text-center" value={datos.carga_lavadero || ""} onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} />
              </div>
              <div className="bg-red-900/10 p-5 rounded-[2rem] border border-red-900/30 text-center">
                <label className="text-[10px] font-black text-red-500 uppercase block mb-1">SALIDA SUCIO</label>
                <input type="number" className="bg-transparent w-full text-5xl font-black text-red-400 outline-none text-center" value={datos.retirado_sucio || ""} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
              </div>
            </div>
          ) : (
            <div className="bg-blue-900/10 p-5 rounded-[2rem] border border-blue-900/30 space-y-4">
               <input type="number" className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-blue-400 outline-none border border-blue-900/20" placeholder="CANTIDAD" value={datos.entrega_piso || ""} onChange={e => setDatos({...datos, entrega_piso: e.target.value})} />
            </div>
          )}
          <button type="submit" className="w-full p-5 rounded-3xl bg-blue-600 text-white font-black uppercase text-sm shadow-xl">Confirmar Registro</button>
        </form>
      )}

      {notificacion.visible && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-blue-600 p-8 rounded-[3rem] text-center shadow-2xl animate-in zoom-in">
             <p className="text-white font-black uppercase text-xs tracking-widest">{notificacion.mensaje}</p>
          </div>
        </div>
      )}
    </div>
  );
};
// cambio de seguridad
export default FormularioPiso;