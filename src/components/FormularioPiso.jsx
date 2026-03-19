import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

const FormularioPiso = ({ perfilUsuario, slugPiso, modoAcceso }) => {
  const [piso, setPiso] = useState(null);
  const [modo, setModo] = useState(modoAcceso || 'piso'); 
  const [stockActual, setStockActual] = useState(0);
  const [novedades, setNovedades] = useState("Sin novedades");
  const [busquedaDni, setBusquedaDni] = useState('');
  const [enfermeroEncontrado, setEnfermeroEncontrado] = useState(null);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [datos, setDatos] = useState({ item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (slugPiso) {
      cargarContexto();
    } else {
      console.error("No hay slug de piso");
      setCargando(false);
    }
  }, [slugPiso]);

  const cargarContexto = async () => {
    setCargando(true);
    
    try {
      let slugBuscar = slugPiso;
      
      // Si es habitación, extraer el slug base del piso (primeros dos segmentos)
      if (modo === 'habitacion') {
        const partes = slugPiso.split('-');
        if (partes.length >= 2) {
          slugBuscar = `${partes[0]}-${partes[1]}`;
        } else {
          console.error("Formato de slug de habitación inválido:", slugPiso);
        }
      }

      console.log("Buscando piso con slug:", slugBuscar);

      const { data, error } = await supabase
        .from('pisos')
        .select('*')
        .eq('slug', slugBuscar)
        .single();

      if (error) {
        console.error("Error cargando piso:", error);
        mostrarSplash("ERROR: Piso no encontrado");
        setCargando(false);
        return;
      }

      if (data) {
        setPiso(data);
        
        // Cargar stock actual para el primer item
        const { data: movs } = await supabase
          .from('movimientos_stock')
          .select('stock_fisico_piso')
          .eq('piso_id', data.id)
          .eq('item', datos.item)
          .order('created_at', { ascending: false })
          .limit(1);
        
        setStockActual(movs?.[0]?.stock_fisico_piso || 0);
      }
    } catch (error) {
      console.error("Error inesperado:", error);
    } finally {
      setCargando(false);
    }
  };

  const mostrarSplash = (msj) => {
    setNotificacion({ visible: true, mensaje: msj });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  const ejecutarCambioEstandar = async () => {
    if (!piso?.id) {
      mostrarSplash("ERROR: Piso no identificado");
      return;
    }

    const items = [
      { item: 'SABANAS', cant: 2 },
      { item: 'TOALLAS', cant: 1 },
      { item: 'TOALLONES', cant: 1 }
    ];

    try {
      for (const i of items) {
        const { error } = await supabase.from('movimientos_stock').insert([{
          piso_id: piso.id,
          dni_pañolero: perfilUsuario.dni,
          item: i.item,
          egreso_limpio: i.cant,
          retirado_sucio: i.cant,
          novedades: novedades,
          stock_fisico_piso: stockActual // Ajusta según necesites
        }]);

        if (error) throw error;
      }
      
      mostrarSplash("CAMBIO ESTÁNDAR REGISTRADO");
      setNovedades("Sin novedades");
      cargarContexto();
    } catch (error) {
      console.error("Error en cambio estándar:", error);
      mostrarSplash("ERROR EN REGISTRO");
    }
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    
    if (!piso?.id) {
      mostrarSplash("Error: Piso no identificado");
      return;
    }

    if (modo === 'piso' && !enfermeroEncontrado) {
      mostrarSplash("Debe buscar un encargado de piso");
      return;
    }

    const nuevoStock = stockActual + 
      (parseInt(datos.carga_lavadero || 0)) - 
      (parseInt(datos.entrega_piso || 0));

    const { error } = await supabase.from('movimientos_stock').insert([{
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: modo === 'piso' ? enfermeroEncontrado?.dni : null,
      item: datos.item,
      entregado_limpio: modo === 'lavadero' ? parseInt(datos.carga_lavadero || 0) : 0,
      egreso_limpio: modo === 'piso' ? parseInt(datos.entrega_piso || 0) : 0,
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio || 0) : 0,
      stock_fisico_piso: nuevoStock,
      novedades: novedades
    }]);

    if (!error) {
      mostrarSplash("REGISTRO EXITOSO");
      setDatos({ item: datos.item, carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
      setStockActual(nuevoStock);
      if (modo === 'habitacion') setNovedades("Sin novedades");
      if (modo === 'piso') {
        setBusquedaDni('');
        setEnfermeroEncontrado(null);
      }
    } else {
      console.error("Error al registrar:", error);
      mostrarSplash("ERROR EN REGISTRO");
    }
  };

  const buscarEnfermero = async () => {
    if (busquedaDni.length < 7) {
      mostrarSplash("DNI inválido");
      return;
    }
    
    const { data, error } = await supabase
      .from('personal')
      .select('*')
      .eq('dni', busquedaDni)
      .eq('rol', 'enfermero')
      .maybeSingle();
    
    if (error) {
      console.error("Error buscando enfermero:", error);
    }
    
    setEnfermeroEncontrado(data);
    if (!data) {
      mostrarSplash("DNI NO REGISTRADO COMO ENFERMERO");
    } else {
      mostrarSplash(`${data.jerarquia} ${data.apellido} encontrado`);
    }
  };

  if (cargando) {
    return (
      <div className="p-10 text-white text-center">
        <div className="animate-pulse">
          <p className="text-blue-400 font-black text-sm mb-2">SENTINEL HNPM</p>
          <p className="text-slate-500 italic text-xs">Cargando {modo} {slugPiso}...</p>
        </div>
      </div>
    );
  }

  if (!piso) {
    return (
      <div className="p-10 text-white text-center">
        <div className="bg-red-900/20 p-6 rounded-3xl border border-red-800">
          <p className="text-red-400 font-black text-sm mb-2">ERROR DE ACCESO</p>
          <p className="text-slate-400 text-xs">No se encontró el sector: {slugPiso}</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-4 bg-slate-800 px-4 py-2 rounded-xl text-xs font-black"
          >
            VOLVER AL INICIO
          </button>
        </div>
      </div>
    );
  }

  // Renderizado del formulario (igual que antes, pero con las mejoras)
  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20 font-sans">
      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30">
        <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">
          {modo === 'habitacion' ? 'SERVICIO HABITACIÓN' : modo === 'lavadero' ? 'CONTROL LAVADERO' : 'CONTROL PAÑOL'}
        </p>
        <h3 className="text-sm font-black uppercase">{piso.nombre_piso}</h3>
        {modo === 'habitacion' && (
          <p className="text-[10px] text-slate-500 mt-1 uppercase">
            Habitación: {slugPiso.split('-').slice(2).join('-').replace(/-/g, ' ')}
          </p>
        )}
      </div>

      {modo === 'habitacion' ? (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Informe de Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-blue-400 outline-none"
              rows="3" 
              placeholder="Ej: No se encontró toallón sucio..."
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
            />
          </div>
          <button 
            onClick={ejecutarCambioEstandar} 
            className="w-full bg-blue-600 p-8 rounded-[2.5rem] font-black uppercase text-sm shadow-2xl active:scale-95 transition-all"
          >
            Registrar Cambio Estándar
          </button>
        </div>
      ) : (
        <form onSubmit={enviarRegistro} className="space-y-4">
          <select 
            className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 font-black text-blue-400 outline-none" 
            value={datos.item} 
            onChange={e => setDatos({...datos, item: e.target.value})}
          >
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>

          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 text-center">
            <p className="text-[10px] font-black uppercase mb-1 text-slate-500">STOCK DISPONIBLE</p>
            <span className="text-5xl font-black text-blue-400">{stockActual}</span>
          </div>

          {modo === 'piso' && (
            <div className="space-y-4">
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 mb-2 uppercase">DNI ENCARGADO DE PISO</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 text-sm outline-none"
                    value={busquedaDni}
                    onChange={(e) => setBusquedaDni(e.target.value)}
                    placeholder="Ingrese DNI"
                  />
                  <button 
                    type="button" 
                    onClick={buscarEnfermero} 
                    className="bg-blue-600 px-4 rounded-xl text-[10px] font-black uppercase"
                  >
                    Buscar
                  </button>
                </div>
                {enfermeroEncontrado && (
                  <p className="text-green-400 text-xs mt-2 font-bold">
                    ✓ {enfermeroEncontrado.jerarquia} {enfermeroEncontrado.apellido}
                  </p>
                )}
              </div>
              <div className="bg-blue-900/10 p-5 rounded-[2rem] border border-blue-900/30 space-y-4">
                <input 
                  type="number" 
                  className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-blue-400 outline-none border border-blue-900/20" 
                  placeholder="CANTIDAD" 
                  value={datos.entrega_piso || ""} 
                  onChange={e => setDatos({...datos, entrega_piso: e.target.value})} 
                />
              </div>
            </div>
          )}

          {modo === 'lavadero' && (
            <div className="space-y-4">
              <div className="bg-green-900/10 p-5 rounded-[2rem] border border-green-900/30 text-center">
                <label className="text-[10px] font-black text-green-500 uppercase block mb-1">INGRESO LIMPIO</label>
                <input 
                  type="number" 
                  className="bg-transparent w-full text-5xl font-black text-green-400 outline-none text-center" 
                  value={datos.carga_lavadero || ""} 
                  onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} 
                />
              </div>
              <div className="bg-red-900/10 p-5 rounded-[2rem] border border-red-900/30 text-center">
                <label className="text-[10px] font-black text-red-500 uppercase block mb-1">SALIDA SUCIO</label>
                <input 
                  type="number" 
                  className="bg-transparent w-full text-5xl font-black text-red-400 outline-none text-center" 
                  value={datos.retirado_sucio || ""} 
                  onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} 
                />
              </div>
            </div>
          )}

          <button 
            type="submit" 
            className="w-full p-5 rounded-3xl bg-blue-600 text-white font-black uppercase text-sm shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={modo === 'piso' && !enfermeroEncontrado}
          >
            Confirmar Registro
          </button>
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

export default FormularioPiso;