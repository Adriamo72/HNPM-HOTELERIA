import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

const FormularioPiso = ({ perfilUsuario, slugPiso, modoAcceso }) => {
  const [piso, setPiso] = useState(null);
  const [habitacionEspecial, setHabitacionEspecial] = useState(null);
  const [modo, setModo] = useState(modoAcceso || 'piso'); 
  const [stocksPorItem, setStocksPorItem] = useState({});
  const [novedades, setNovedades] = useState("Sin novedades");
  const [busquedaDni, setBusquedaDni] = useState('');
  const [enfermeroEncontrado, setEnfermeroEncontrado] = useState(null);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [datos, setDatos] = useState({ item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
  const [cargando, setCargando] = useState(true);
  
  const [itemsHabitacion, setItemsHabitacion] = useState([
    { item: 'SABANAS', cantidadLimpia: 0, cantidadSucia: 0 },
    { item: 'TOALLAS', cantidadLimpia: 0, cantidadSucia: 0 },
    { item: 'TOALLONES', cantidadLimpia: 0, cantidadSucia: 0 },
    { item: 'FRAZADAS', cantidadLimpia: 0, cantidadSucia: 0 },
    { item: 'CUBRECAMAS', cantidadLimpia: 0, cantidadSucia: 0 }
  ]);

  useEffect(() => {
    if (slugPiso) {
      cargarContexto();
    } else {
      setCargando(false);
    }
  }, [slugPiso]);

  const cargarContexto = async () => {
    setCargando(true);
    
    try {
      let pisoData = null;
      let habitacionData = null;

      if (modo === 'habitacion') {
        const { data: habitacion } = await supabase
          .from('habitaciones_especiales')
          .select('*, pisos(*)')
          .eq('slug', slugPiso)
          .maybeSingle();

        if (habitacion) {
          habitacionData = habitacion;
          pisoData = habitacion.pisos;
        }
      }

      if (!pisoData) {
        const { data: piso, error } = await supabase
          .from('pisos')
          .select('*')
          .eq('slug', slugPiso)
          .single();

        if (error) {
          mostrarSplash("ERROR: Sector no encontrado");
          setCargando(false);
          return;
        }
        pisoData = piso;
      }

      if (pisoData) {
        setPiso(pisoData);
        if (habitacionData) {
          setHabitacionEspecial(habitacionData);
        }
        
        // Cargar stock actual para cada item
        const stocksTemp = {};
        for (const item of ITEMS_HOTELERIA) {
          const { data: movs } = await supabase
            .from('movimientos_stock')
            .select('stock_fisico_piso')
            .eq('piso_id', pisoData.id)
            .eq('item', item)
            .order('created_at', { ascending: false })
            .limit(1);
          
          stocksTemp[item] = movs?.[0]?.stock_fisico_piso || 0;
        }
        
        console.log("📊 Stock cargado:", stocksTemp);
        setStocksPorItem(stocksTemp);
      }
    } catch (error) {
      console.error(error);
      mostrarSplash("ERROR INESPERADO");
    } finally {
      setCargando(false);
    }
  };

  const mostrarSplash = (msj) => {
    setNotificacion({ visible: true, mensaje: msj });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  const actualizarItemHabitacion = (index, campo, valor) => {
    const nuevosItems = [...itemsHabitacion];
    nuevosItems[index][campo] = parseInt(valor) || 0;
    setItemsHabitacion(nuevosItems);
  };

  // ==================== REGISTRO HABITACIÓN ====================
  const ejecutarCambioHabitacion = async () => {
    if (!piso?.id) {
      mostrarSplash("ERROR: Piso no identificado");
      return;
    }

    const hayMovimientos = itemsHabitacion.some(
      item => item.cantidadLimpia > 0 || item.cantidadSucia > 0
    );

    if (!hayMovimientos) {
      mostrarSplash("INGRESE AL MENOS UN ITEM");
      return;
    }

    try {
      let registrosExitosos = 0;
      
      for (const itemConf of itemsHabitacion) {
        if (itemConf.cantidadLimpia === 0 && itemConf.cantidadSucia === 0) continue;

        const stockActual = stocksPorItem[itemConf.item] || 0;
        const nuevoStock = stockActual - itemConf.cantidadLimpia;

        if (nuevoStock < 0) {
          mostrarSplash(`Stock insuficiente de ${itemConf.item}. Disponible: ${stockActual}`);
          continue;
        }

        const movimiento = {
          piso_id: piso.id,
          dni_pañolero: perfilUsuario.dni,
          item: itemConf.item,
          egreso_limpio: itemConf.cantidadLimpia,
          retirado_sucio: itemConf.cantidadSucia,
          stock_fisico_piso: nuevoStock,
          novedades: novedades,
          es_cambio_habitacion: true
        };

        if (habitacionEspecial) {
          movimiento.habitacion_id = habitacionEspecial.id;
        }

        console.log(`📝 Registrando ${itemConf.item}: stock ${stockActual} -> ${nuevoStock}`);
        const { error } = await supabase.from('movimientos_stock').insert([movimiento]);

        if (!error) {
          registrosExitosos++;
          setStocksPorItem(prev => ({
            ...prev,
            [itemConf.item]: nuevoStock
          }));
          console.log(`✅ ${itemConf.item} actualizado a ${nuevoStock}`);
        } else {
          console.error(`❌ Error en ${itemConf.item}:`, error);
        }
      }
      
      if (registrosExitosos > 0) {
        mostrarSplash(`${registrosExitosos} ITEMS REGISTRADOS`);
        setNovedades("Sin novedades");
        setItemsHabitacion(itemsHabitacion.map(item => ({
          ...item,
          cantidadLimpia: 0,
          cantidadSucia: 0
        })));
      }
      
    } catch (error) {
      console.error(error);
      mostrarSplash("ERROR EN REGISTRO");
    }
  };

  // ==================== REGISTRO PAÑOL - ENTREGA A PISO ====================
  const registrarEntregaPiso = async (e) => {
    e.preventDefault();
    
    if (!piso?.id) {
      mostrarSplash("Error: Piso no identificado");
      return;
    }

    if (!enfermeroEncontrado) {
      mostrarSplash("Debe buscar un encargado de piso");
      return;
    }

    const cantidadEntregada = parseInt(datos.entrega_piso || 0);
    if (cantidadEntregada <= 0) {
      mostrarSplash("Ingrese una cantidad válida");
      return;
    }

    const stockActual = stocksPorItem[datos.item] || 0;
    const nuevoStock = stockActual - cantidadEntregada;

    console.log(`📦 Entrega a piso: ${datos.item}`);
    console.log(`   Stock actual: ${stockActual}`);
    console.log(`   Cantidad entregar: ${cantidadEntregada}`);
    console.log(`   Nuevo stock: ${nuevoStock}`);

    if (nuevoStock < 0) {
      mostrarSplash(`Stock insuficiente. Disponible: ${stockActual}`);
      return;
    }

    const movimiento = {
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: enfermeroEncontrado.dni,
      item: datos.item,
      egreso_limpio: cantidadEntregada,
      stock_fisico_piso: nuevoStock,
      novedades: novedades
    };

    const { error } = await supabase.from('movimientos_stock').insert([movimiento]);

    if (!error) {
      // Actualizar stock local INMEDIATAMENTE
      setStocksPorItem(prev => {
        const updated = {
          ...prev,
          [datos.item]: nuevoStock
        };
        console.log("✅ Stock actualizado:", updated);
        return updated;
      });
      
      mostrarSplash(`${cantidadEntregada} ${datos.item} entregados a ${enfermeroEncontrado.apellido}`);
      
      // Limpiar formulario
      setDatos({ ...datos, entrega_piso: 0 });
      setBusquedaDni('');
      setEnfermeroEncontrado(null);
      setNovedades("Sin novedades");
    } else {
      console.error("❌ Error al registrar:", error);
      mostrarSplash("ERROR EN REGISTRO");
    }
  };

  // ==================== REGISTRO LAVADERO ====================
  const registrarLavadero = async (e) => {
    e.preventDefault();
    
    if (!piso?.id) {
      mostrarSplash("Error: Piso no identificado");
      return;
    }

    const ingresoLimpio = parseInt(datos.carga_lavadero || 0);
    const salidaSucio = parseInt(datos.retirado_sucio || 0);

    if (ingresoLimpio === 0 && salidaSucio === 0) {
      mostrarSplash("Ingrese al menos una cantidad");
      return;
    }

    const stockActual = stocksPorItem[datos.item] || 0;
    const nuevoStock = stockActual + ingresoLimpio;

    console.log(`🧺 Lavadero: ${datos.item}`);
    console.log(`   Stock actual: ${stockActual}`);
    console.log(`   Ingreso limpio: ${ingresoLimpio}`);
    console.log(`   Nuevo stock: ${nuevoStock}`);

    const movimiento = {
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      item: datos.item,
      entregado_limpio: ingresoLimpio,
      retirado_sucio: salidaSucio,
      stock_fisico_piso: nuevoStock,
      novedades: novedades
    };

    const { error } = await supabase.from('movimientos_stock').insert([movimiento]);

    if (!error) {
      setStocksPorItem(prev => ({
        ...prev,
        [datos.item]: nuevoStock
      }));
      
      let mensaje = [];
      if (ingresoLimpio > 0) mensaje.push(`${ingresoLimpio} limpios recibidos`);
      if (salidaSucio > 0) mensaje.push(`${salidaSucio} sucios retirados`);
      mostrarSplash(`${datos.item}: ${mensaje.join(' / ')}`);
      
      setDatos({ ...datos, carga_lavadero: 0, retirado_sucio: 0 });
      setNovedades("Sin novedades");
    } else {
      console.error("❌ Error al registrar:", error);
      mostrarSplash("ERROR EN REGISTRO");
    }
  };

  // ==================== CAMBIO ESTÁNDAR HABITACIÓN ====================
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
      let errores = false;
      
      for (const i of items) {
        const stockActual = stocksPorItem[i.item] || 0;
        const nuevoStock = stockActual - i.cant;

        console.log(`🏨 Cambio estándar ${i.item}: ${stockActual} -> ${nuevoStock}`);

        if (nuevoStock < 0) {
          mostrarSplash(`Stock insuficiente de ${i.item}. Disponible: ${stockActual}`);
          errores = true;
          continue;
        }

        const movimiento = {
          piso_id: piso.id,
          dni_pañolero: perfilUsuario.dni,
          item: i.item,
          egreso_limpio: i.cant,
          retirado_sucio: i.cant,
          novedades: novedades,
          es_cambio_habitacion: true,
          stock_fisico_piso: nuevoStock
        };

        if (habitacionEspecial) {
          movimiento.habitacion_id = habitacionEspecial.id;
        }

        const { error } = await supabase.from('movimientos_stock').insert([movimiento]);
        if (error) {
          errores = true;
          console.error(`❌ Error en ${i.item}:`, error);
        } else {
          setStocksPorItem(prev => ({ ...prev, [i.item]: nuevoStock }));
        }
      }
      
      if (!errores) {
        mostrarSplash("CAMBIO ESTÁNDAR REGISTRADO");
        setNovedades("Sin novedades");
      }
    } catch (error) {
      console.error(error);
      mostrarSplash("ERROR EN REGISTRO");
    }
  };

  const buscarEnfermero = async () => {
    if (busquedaDni.length < 7) {
      mostrarSplash("DNI inválido");
      return;
    }
    
    const { data } = await supabase
      .from('personal')
      .select('*')
      .eq('dni', busquedaDni)
      .in('rol', ['enfermero', 'ADMIN'])
      .maybeSingle();
    
    setEnfermeroEncontrado(data);
    if (!data) {
      mostrarSplash("DNI NO REGISTRADO");
    } else {
      mostrarSplash(`${data.jerarquia} ${data.apellido}`);
    }
  };

  if (cargando) {
    return (
      <div className="p-10 text-white text-center">
        <div className="animate-pulse">
          <p className="text-blue-400 font-black text-sm mb-2">SENTINEL HNPM</p>
          <p className="text-slate-500 italic text-xs">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!piso) {
    return (
      <div className="p-10 text-white text-center">
        <div className="bg-red-900/20 p-6 rounded-3xl border border-red-800">
          <p className="text-red-400 font-black text-sm mb-2">ERROR DE ACCESO</p>
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

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20 font-sans">
      <div className="mb-6 bg-slate-900/50 p-4 rounded-3xl border border-blue-900/30">
        <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">
          {modo === 'habitacion' ? 'SERVICIO HABITACIÓN' : modo === 'lavadero' ? 'CONTROL LAVADERO' : 'CONTROL PAÑOL'}
        </p>
        <h3 className="text-sm font-black uppercase">{piso.nombre_piso}</h3>
        {habitacionEspecial && (
          <p className="text-[10px] text-blue-400 mt-1 uppercase font-bold">
            Habitación: {habitacionEspecial.nombre}
          </p>
        )}
      </div>

      {modo === 'habitacion' ? (
        <div className="space-y-4">
          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-4">ITEMS</p>
            
            {itemsHabitacion.map((itemConf, index) => (
              <div key={itemConf.item} className="mb-6 last:mb-0 border-b border-slate-800 pb-4 last:border-0">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm font-black text-blue-400">{itemConf.item}</p>
                  <p className="text-[10px] text-slate-500">Stock: {stocksPorItem[itemConf.item] || 0}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[8px] text-green-500 font-black uppercase block mb-1">
                      ENTREGA LIMPIA
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xl text-green-400 font-black text-center outline-none"
                      value={itemConf.cantidadLimpia || ""}
                      onChange={(e) => actualizarItemHabitacion(index, 'cantidadLimpia', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className="text-[8px] text-red-500 font-black uppercase block mb-1">
                      RETIRA SUCIO
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xl text-red-400 font-black text-center outline-none"
                      value={itemConf.cantidadSucia || ""}
                      onChange={(e) => actualizarItemHabitacion(index, 'cantidadSucia', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-blue-400 outline-none"
              rows="2" 
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
            />
          </div>

          <button 
            onClick={ejecutarCambioEstandar}
            className="w-full bg-green-600 p-4 rounded-[2rem] font-black uppercase text-sm shadow-2xl active:scale-95 transition-all"
          >
            Cambio Estándar (2 Sábanas + 1 Toalla + 1 Toallón)
          </button>

          <button 
            onClick={ejecutarCambioHabitacion} 
            className="w-full bg-blue-600 p-6 rounded-[2.5rem] font-black uppercase text-sm shadow-2xl active:scale-95 transition-all"
          >
            Registrar Cambio Personalizado
          </button>
        </div>
      ) : modo === 'lavadero' ? (
        <form onSubmit={registrarLavadero} className="space-y-4">
          <select 
            className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 font-black text-blue-400 outline-none" 
            value={datos.item} 
            onChange={e => setDatos({...datos, item: e.target.value})}
          >
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>

          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 text-center">
            <p className="text-[10px] font-black uppercase mb-1 text-slate-500">STOCK EN PAÑOL</p>
            <span className="text-5xl font-black text-blue-400">{stocksPorItem[datos.item] || 0}</span>
          </div>

          <div className="bg-green-900/10 p-5 rounded-[2rem] border border-green-900/30 text-center">
            <label className="text-[10px] font-black text-green-500 uppercase block mb-1">
              ENTREGA LIMPIA AL PAÑOL
            </label>
            <input 
              type="number" 
              className="bg-transparent w-full text-5xl font-black text-green-400 outline-none text-center" 
              value={datos.carga_lavadero || ""} 
              onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} 
              placeholder="0"
            />
            <p className="text-[8px] text-slate-500 mt-1">✓ Aumenta el stock del pañol</p>
          </div>

          <div className="bg-red-900/10 p-5 rounded-[2rem] border border-red-900/30 text-center">
            <label className="text-[10px] font-black text-red-500 uppercase block mb-1">
              RECIBE SUCIO DEL PISO
            </label>
            <input 
              type="number" 
              className="bg-transparent w-full text-5xl font-black text-red-400 outline-none text-center" 
              value={datos.retirado_sucio || ""} 
              onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} 
              placeholder="0"
            />
            <p className="text-[8px] text-slate-500 mt-1">⭕ No afecta el stock (solo registro)</p>
          </div>

          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-blue-400 outline-none"
              rows="2" 
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            className="w-full p-5 rounded-3xl bg-blue-600 text-white font-black uppercase text-sm shadow-xl"
          >
            Registrar Movimiento
          </button>
        </form>
      ) : (
        // MODO PAÑOL - ENTREGA AL ENCARGADO DE PISO
        <form onSubmit={registrarEntregaPiso} className="space-y-4">
          <select 
            className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 font-black text-blue-400 outline-none" 
            value={datos.item} 
            onChange={e => setDatos({...datos, item: e.target.value})}
          >
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>

          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 text-center">
            <p className="text-[10px] font-black uppercase mb-1 text-slate-500">STOCK EN PAÑOL</p>
            <span className="text-5xl font-black text-blue-400">{stocksPorItem[datos.item] || 0}</span>
          </div>

          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 mb-2 uppercase">ENCARGADO DE PISO</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 text-sm outline-none"
                value={busquedaDni}
                onChange={(e) => setBusquedaDni(e.target.value)}
                placeholder="DNI"
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

          <div className="bg-blue-900/10 p-5 rounded-[2rem] border border-blue-900/30">
            <label className="text-[10px] font-black text-blue-500 uppercase block text-center mb-2">
              CANTIDAD A ENTREGAR
            </label>
            <input 
              type="number" 
              className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-blue-400 outline-none border border-blue-900/20" 
              placeholder="0" 
              value={datos.entrega_piso || ""} 
              onChange={e => setDatos({...datos, entrega_piso: e.target.value})} 
            />
            <p className="text-[8px] text-slate-500 text-center mt-2">
              ⚠️ Esta cantidad se DESCONTARÁ del stock del pañol
            </p>
          </div>

          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-blue-400 outline-none"
              rows="2" 
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            className="w-full p-5 rounded-3xl bg-blue-600 text-white font-black uppercase text-sm shadow-xl disabled:opacity-50"
            disabled={!enfermeroEncontrado}
          >
            Entregar al Piso
          </button>
        </form>
      )}

      {notificacion.visible && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-blue-600 p-8 rounded-[3rem] text-center shadow-2xl">
             <p className="text-white font-black uppercase text-xs tracking-widest">{notificacion.mensaje}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormularioPiso;