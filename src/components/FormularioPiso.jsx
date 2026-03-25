import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

const FormularioPiso = ({ perfilUsuario, slugPiso, modoAcceso }) => {
  const [piso, setPiso] = useState(null);
  const [habitacionEspecial, setHabitacionEspecial] = useState(null);
  const [modo, setModo] = useState(modoAcceso || 'piso'); 
  const [stocksPorItem, setStocksPorItem] = useState({});
  const [stocksUsoPorItem, setStocksUsoPorItem] = useState({});
  const [stocksLavaderoPorItem, setStocksLavaderoPorItem] = useState({});
  const [novedades, setNovedades] = useState("Sin novedades");
  const [busquedaDni, setBusquedaDni] = useState('');
  const [enfermeroEncontrado, setEnfermeroEncontrado] = useState(null);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [datos, setDatos] = useState({ item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
  const [cargando, setCargando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  
  const [itemsHabitacion, setItemsHabitacion] = useState([
    { item: 'SABANAS', cantidad: 0 },
    { item: 'TOALLAS', cantidad: 0 },
    { item: 'TOALLONES', cantidad: 0 },
    { item: 'FRAZADAS', cantidad: 0 },
    { item: 'CUBRECAMAS', cantidad: 0 }
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
        
        // Cargar stock de las 3 tablas
        const stocksTemp = {};
        const stocksUsoTemp = {};
        const stocksLavaderoTemp = {};
        
        for (const item of ITEMS_HOTELERIA) {
          // Stock en pañol
          const { data: stockPañol } = await supabase
            .from('stock_piso')
            .select('cantidad')
            .eq('piso_id', pisoData.id)
            .eq('item', item)
            .maybeSingle();
          stocksTemp[item] = stockPañol?.cantidad || 0;
          
          // Stock en uso
          const { data: stockUso } = await supabase
            .from('stock_piso_uso')
            .select('cantidad')
            .eq('piso_id', pisoData.id)
            .eq('item', item)
            .maybeSingle();
          stocksUsoTemp[item] = stockUso?.cantidad || 0;
          
          // Stock en lavadero
          const { data: stockLavadero } = await supabase
            .from('stock_lavadero')
            .select('cantidad')
            .eq('piso_id', pisoData.id)
            .eq('item', item)
            .maybeSingle();
          stocksLavaderoTemp[item] = stockLavadero?.cantidad || 0;
        }
        
        setStocksPorItem(stocksTemp);
        setStocksUsoPorItem(stocksUsoTemp);
        setStocksLavaderoPorItem(stocksLavaderoTemp);
        
        console.log("📊 Stocks cargados:", { stocksTemp, stocksUsoTemp, stocksLavaderoTemp });
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

  const actualizarItemHabitacion = (index, valor) => {
    const nuevosItems = [...itemsHabitacion];
    nuevosItems[index].cantidad = parseInt(valor) || 0;
    setItemsHabitacion(nuevosItems);
  };

  // ==================== ACTUALIZAR STOCK EN TABLAS ====================
  const actualizarStockPañol = async (item, nuevaCantidad) => {
    const { error } = await supabase
      .from('stock_piso')
      .upsert({
        piso_id: piso.id,
        item: item,
        cantidad: nuevaCantidad,
        updated_at: new Date()
      }, { onConflict: 'piso_id,item' });
    
    if (error) console.error("Error actualizando stock_piso:", error);
    return !error;
  };

  const actualizarStockUso = async (item, nuevaCantidad) => {
    const { error } = await supabase
      .from('stock_piso_uso')
      .upsert({
        piso_id: piso.id,
        item: item,
        cantidad: nuevaCantidad,
        updated_at: new Date()
      }, { onConflict: 'piso_id,item' });
    
    if (error) console.error("Error actualizando stock_piso_uso:", error);
    return !error;
  };

  const actualizarStockLavadero = async (item, nuevaCantidad) => {
    const { error } = await supabase
      .from('stock_lavadero')
      .upsert({
        piso_id: piso.id,
        item: item,
        cantidad: nuevaCantidad,
        updated_at: new Date()
      }, { onConflict: 'piso_id,item' });
    
    if (error) console.error("Error actualizando stock_lavadero:", error);
    return !error;
  };

  // ==================== REGISTRO HABITACIÓN (Entrega limpia) ====================
  const ejecutarCambioHabitacion = async () => {
    if (!piso?.id) {
      mostrarSplash("ERROR: Piso no identificado");
      return;
    }

    const hayMovimientos = itemsHabitacion.some(item => item.cantidad > 0);

    if (!hayMovimientos) {
      mostrarSplash("INGRESE AL MENOS UN ITEM");
      return;
    }

    setRegistrando(true);
    
    try {
      let registrosExitosos = 0;
      const movimientosInsertados = [];
      
      for (const itemConf of itemsHabitacion) {
        if (itemConf.cantidad === 0) continue;

        const stockActualPañol = stocksPorItem[itemConf.item] || 0;
        const nuevoStockPañol = stockActualPañol - itemConf.cantidad;
        const nuevoStockUso = (stocksUsoPorItem[itemConf.item] || 0) + itemConf.cantidad;

        console.log(`📝 ${itemConf.item}: Pañol ${stockActualPañol} → ${nuevoStockPañol}, Uso +${itemConf.cantidad}`);

        if (nuevoStockPañol < 0) {
          mostrarSplash(`❌ Stock insuficiente de ${itemConf.item}. Disponible: ${stockActualPañol}`);
          continue;
        }

        // Insertar movimiento en historial
        const movimiento = {
          piso_id: piso.id,
          dni_pañolero: perfilUsuario.dni,
          item: itemConf.item,
          egreso_limpio: itemConf.cantidad,
          stock_fisico_piso: nuevoStockPañol,
          novedades: novedades,
          es_cambio_habitacion: true
        };

        if (habitacionEspecial) {
          movimiento.habitacion_id = habitacionEspecial.id;
        }

        const { error: movError } = await supabase.from('movimientos_stock').insert([movimiento]);
        
        if (movError) {
          console.error(`❌ Error en movimiento ${itemConf.item}:`, movError);
          continue;
        }

        // Actualizar stock en tablas
        const okPañol = await actualizarStockPañol(itemConf.item, nuevoStockPañol);
        const okUso = await actualizarStockUso(itemConf.item, nuevoStockUso);
        
        if (okPañol && okUso) {
          registrosExitosos++;
          movimientosInsertados.push(itemConf.item);
          setStocksPorItem(prev => ({ ...prev, [itemConf.item]: nuevoStockPañol }));
          setStocksUsoPorItem(prev => ({ ...prev, [itemConf.item]: nuevoStockUso }));
        }
      }
      
      if (registrosExitosos > 0) {
        mostrarSplash(`✅ ${registrosExitosos} ITEM(S) REGISTRADO(S): ${movimientosInsertados.join(', ')}`);
        setNovedades("Sin novedades");
        setItemsHabitacion(itemsHabitacion.map(item => ({ ...item, cantidad: 0 })));
      }
      
    } catch (error) {
      console.error("Error:", error);
      mostrarSplash("ERROR EN REGISTRO");
    } finally {
      setRegistrando(false);
    }
  };

  // ==================== CAMBIO ESTÁNDAR HABITACIÓN ====================
  const ejecutarCambioEstandar = async () => {
    if (!piso?.id) {
      mostrarSplash("ERROR: Piso no identificado");
      return;
    }

    setRegistrando(true);
    
    const itemsEstandar = [
      { item: 'SABANAS', cant: 2 },
      { item: 'TOALLAS', cant: 1 },
      { item: 'TOALLONES', cant: 1 }
    ];

    try {
      let errores = false;
      let exitosos = [];
      
      for (const i of itemsEstandar) {
        const stockActualPañol = stocksPorItem[i.item] || 0;
        const nuevoStockPañol = stockActualPañol - i.cant;
        const nuevoStockUso = (stocksUsoPorItem[i.item] || 0) + i.cant;

        console.log(`📝 Cambio estándar ${i.item}: Pañol ${stockActualPañol} → ${nuevoStockPañol}, Uso +${i.cant}`);

        if (nuevoStockPañol < 0) {
          mostrarSplash(`❌ Stock insuficiente de ${i.item}. Disponible: ${stockActualPañol}`);
          errores = true;
          continue;
        }

        const movimiento = {
          piso_id: piso.id,
          dni_pañolero: perfilUsuario.dni,
          item: i.item,
          egreso_limpio: i.cant,
          stock_fisico_piso: nuevoStockPañol,
          novedades: novedades,
          es_cambio_habitacion: true
        };

        if (habitacionEspecial) {
          movimiento.habitacion_id = habitacionEspecial.id;
        }

        const { error: movError } = await supabase.from('movimientos_stock').insert([movimiento]);
        
        if (movError) {
          errores = true;
          console.error(`❌ Error en ${i.item}:`, movError);
          continue;
        }

        const okPañol = await actualizarStockPañol(i.item, nuevoStockPañol);
        const okUso = await actualizarStockUso(i.item, nuevoStockUso);
        
        if (okPañol && okUso) {
          exitosos.push(i.item);
          setStocksPorItem(prev => ({ ...prev, [i.item]: nuevoStockPañol }));
          setStocksUsoPorItem(prev => ({ ...prev, [i.item]: nuevoStockUso }));
        } else {
          errores = true;
        }
      }
      
      if (!errores && exitosos.length > 0) {
        mostrarSplash(`✅ CAMBIO ESTÁNDAR REGISTRADO: ${exitosos.join(', ')}`);
        setNovedades("Sin novedades");
      } else if (exitosos.length > 0) {
        mostrarSplash(`⚠️ REGISTRO PARCIAL: ${exitosos.join(', ')}`);
      } else {
        mostrarSplash("❌ ERROR: No hay stock suficiente");
      }
    } catch (error) {
      console.error(error);
      mostrarSplash("ERROR EN REGISTRO");
    } finally {
      setRegistrando(false);
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

    setRegistrando(true);

    const stockActualPañol = stocksPorItem[datos.item] || 0;
    const nuevoStockPañol = stockActualPañol - cantidadEntregada;
    const nuevoStockUso = (stocksUsoPorItem[datos.item] || 0) + cantidadEntregada;

    console.log(`📦 Entrega a piso - ${datos.item}: Pañol ${stockActualPañol} → ${nuevoStockPañol}, Uso +${cantidadEntregada}`);

    if (nuevoStockPañol < 0) {
      mostrarSplash(`❌ Stock insuficiente. Disponible: ${stockActualPañol}`);
      setRegistrando(false);
      return;
    }

    // Insertar movimiento
    const movimiento = {
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: enfermeroEncontrado.dni,
      item: datos.item,
      egreso_limpio: cantidadEntregada,
      stock_fisico_piso: nuevoStockPañol,
      novedades: novedades
    };

    const { error: movError } = await supabase.from('movimientos_stock').insert([movimiento]);
    
    if (movError) {
      mostrarSplash("❌ ERROR EN REGISTRO");
      setRegistrando(false);
      return;
    }

    // Actualizar stocks
    const okPañol = await actualizarStockPañol(datos.item, nuevoStockPañol);
    const okUso = await actualizarStockUso(datos.item, nuevoStockUso);
    
    if (okPañol && okUso) {
      setStocksPorItem(prev => ({ ...prev, [datos.item]: nuevoStockPañol }));
      setStocksUsoPorItem(prev => ({ ...prev, [datos.item]: nuevoStockUso }));
      
      mostrarSplash(`✅ ${cantidadEntregada} ${datos.item} entregados a ${enfermeroEncontrado.apellido}`);
      
      setDatos({ ...datos, entrega_piso: 0 });
      setBusquedaDni('');
      setEnfermeroEncontrado(null);
      setNovedades("Sin novedades");
    } else {
      mostrarSplash("❌ ERROR AL ACTUALIZAR STOCK");
    }
    
    setRegistrando(false);
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

    setRegistrando(true);

    let nuevoStockPañol = stocksPorItem[datos.item] || 0;
    let nuevoStockLavadero = stocksLavaderoPorItem[datos.item] || 0;
    let nuevoStockUso = stocksUsoPorItem[datos.item] || 0;
    let mensajes = [];

    // 1. Si el lavadero recibe sucio (sale del uso, va al lavadero)
    if (salidaSucio > 0) {
      if (nuevoStockUso < salidaSucio) {
        mostrarSplash(`❌ No hay suficiente stock en uso. Disponible: ${nuevoStockUso}`);
        setRegistrando(false);
        return;
      }
      nuevoStockUso -= salidaSucio;
      nuevoStockLavadero += salidaSucio;
      mensajes.push(`${salidaSucio} sucios retirados`);
      console.log(`🧺 Retiro sucio: Uso ${stocksUsoPorItem[datos.item] || 0} → ${nuevoStockUso}, Lavadero +${salidaSucio}`);
    }

    // 2. Si el lavadero entrega limpio (sale del lavadero, va al pañol)
    if (ingresoLimpio > 0) {
      if (nuevoStockLavadero < ingresoLimpio) {
        mostrarSplash(`❌ No hay suficiente stock en lavadero. Disponible: ${nuevoStockLavadero}`);
        setRegistrando(false);
        return;
      }
      nuevoStockLavadero -= ingresoLimpio;
      nuevoStockPañol += ingresoLimpio;
      mensajes.push(`${ingresoLimpio} limpios recibidos`);
      console.log(`🧺 Entrega limpio: Lavadero ${stocksLavaderoPorItem[datos.item] || 0} → ${nuevoStockLavadero}, Pañol +${ingresoLimpio}`);
    }

    // Insertar movimiento
    const movimiento = {
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      item: datos.item,
      entregado_limpio: ingresoLimpio,
      retirado_sucio: salidaSucio,
      stock_fisico_piso: nuevoStockPañol,
      novedades: novedades
    };

    const { error: movError } = await supabase.from('movimientos_stock').insert([movimiento]);
    
    if (movError) {
      mostrarSplash("❌ ERROR EN REGISTRO");
      setRegistrando(false);
      return;
    }

    // Actualizar las 3 tablas
    const okPañol = await actualizarStockPañol(datos.item, nuevoStockPañol);
    const okUso = await actualizarStockUso(datos.item, nuevoStockUso);
    const okLavadero = await actualizarStockLavadero(datos.item, nuevoStockLavadero);
    
    if (okPañol && okUso && okLavadero) {
      setStocksPorItem(prev => ({ ...prev, [datos.item]: nuevoStockPañol }));
      setStocksUsoPorItem(prev => ({ ...prev, [datos.item]: nuevoStockUso }));
      setStocksLavaderoPorItem(prev => ({ ...prev, [datos.item]: nuevoStockLavadero }));
      
      mostrarSplash(`✅ ${datos.item}: ${mensajes.join(' / ')}`);
      
      setDatos({ ...datos, carga_lavadero: 0, retirado_sucio: 0 });
      setNovedades("Sin novedades");
    } else {
      mostrarSplash("❌ ERROR AL ACTUALIZAR STOCK");
    }
    
    setRegistrando(false);
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
        <div className="bg-red-900/20 p-6 rounded-lg border border-red-800">
          <p className="text-red-400 font-black text-sm mb-2">ERROR DE ACCESO</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-4 bg-slate-800 px-4 py-2 rounded-lg text-xs font-black"
          >
            VOLVER AL INICIO
          </button>
        </div>
      </div>
    );
  }

  // Calcular total real por item
  const totalRealPorItem = (item) => {
    return (stocksPorItem[item] || 0) + (stocksUsoPorItem[item] || 0) + (stocksLavaderoPorItem[item] || 0);
  };

  return (
    <div className="p-4 md:p-6 bg-slate-950 min-h-screen text-slate-200 pb-20 font-sans">
      <div className="mb-4 bg-slate-900/50 p-3 rounded-lg border border-blue-900/30">
        <p className="text-[8px] text-blue-500 font-black uppercase tracking-wider">
          {modo === 'habitacion' ? 'SERVICIO HABITACIÓN' : modo === 'lavadero' ? 'CONTROL LAVADERO' : 'CONTROL PAÑOL'}
        </p>
        <h3 className="text-sm font-black uppercase">{piso.nombre_piso}</h3>
        {habitacionEspecial && (
          <p className="text-[9px] text-blue-400 mt-1 uppercase font-bold">
            Habitación: {habitacionEspecial.nombre}
          </p>
        )}
      </div>

      {modo === 'habitacion' ? (
        <div className="space-y-3">
          <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center mb-3">
              <p className="text-[9px] font-black text-slate-500 uppercase">ITEMS PARA ENTREGA</p>
              <div className="flex gap-2 text-[8px]">
                <span className="text-green-400">Pañol: {stocksPorItem['SABANAS'] || 0}</span>
                <span className="text-yellow-400">Uso: {stocksUsoPorItem['SABANAS'] || 0}</span>
                <span className="text-red-400">Lav: {stocksLavaderoPorItem['SABANAS'] || 0}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {itemsHabitacion.map((itemConf, index) => (
                <div key={itemConf.item} className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-black text-blue-400">{itemConf.item}</p>
                    <div className="flex gap-1">
                      <span className="text-[7px] text-green-400">P:{stocksPorItem[itemConf.item] || 0}</span>
                      <span className="text-[7px] text-yellow-400">U:{stocksUsoPorItem[itemConf.item] || 0}</span>
                      <span className="text-[7px] text-red-400">L:{stocksLavaderoPorItem[itemConf.item] || 0}</span>
                      <span className="text-[7px] text-blue-400">T:{totalRealPorItem(itemConf.item)}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[7px] text-green-500 font-black uppercase block mb-1">
                      CANTIDAD A ENTREGAR (-)
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xl text-green-400 font-black text-center outline-none"
                      value={itemConf.cantidad || ""}
                      onChange={(e) => actualizarItemHabitacion(index, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
            <p className="text-[9px] font-black text-slate-500 uppercase mb-2">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-blue-400 outline-none"
              rows="2" 
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
              placeholder="Observaciones sobre el servicio..."
            />
          </div>

          <button 
            onClick={ejecutarCambioEstandar}
            disabled={registrando}
            className={`w-full p-3 rounded-lg font-black uppercase text-sm transition-all ${registrando ? 'bg-slate-600 cursor-not-allowed' : 'bg-green-600 active:scale-95'}`}
          >
            {registrando ? 'REGISTRANDO...' : 'Cambio Estándar (2 Sábanas + 1 Toalla + 1 Toallón)'}
          </button>

          <button 
            onClick={ejecutarCambioHabitacion} 
            disabled={registrando}
            className={`w-full p-4 rounded-lg font-black uppercase text-sm transition-all ${registrando ? 'bg-slate-600 cursor-not-allowed' : 'bg-blue-600 active:scale-95'}`}
          >
            {registrando ? 'REGISTRANDO...' : 'Registrar Entrega Personalizada'}
          </button>
        </div>
      ) : modo === 'lavadero' ? (
        <form onSubmit={registrarLavadero} className="space-y-3">
          <select 
            className="w-full bg-slate-900 p-3 rounded-lg border border-slate-800 font-black text-blue-400 outline-none" 
            value={datos.item} 
            onChange={e => setDatos({...datos, item: e.target.value})}
          >
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>

          <div className="grid grid-cols-3 gap-2 bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
            <div>
              <p className="text-[7px] text-green-500 uppercase">Pañol</p>
              <p className="text-lg font-black text-green-400">{stocksPorItem[datos.item] || 0}</p>
            </div>
            <div>
              <p className="text-[7px] text-yellow-500 uppercase">En Uso</p>
              <p className="text-lg font-black text-yellow-400">{stocksUsoPorItem[datos.item] || 0}</p>
            </div>
            <div>
              <p className="text-[7px] text-red-500 uppercase">Lavadero</p>
              <p className="text-lg font-black text-red-400">{stocksLavaderoPorItem[datos.item] || 0}</p>
            </div>
          </div>

          <div className="bg-red-900/10 p-4 rounded-lg border border-red-900/30 text-center">
            <label className="text-[9px] font-black text-red-500 uppercase block mb-1">
              RECIBE SUCIO DEL PISO (Uso → Lavadero)
            </label>
            <input 
              type="number" 
              className="bg-transparent w-full text-4xl font-black text-red-400 outline-none text-center" 
              value={datos.retirado_sucio || ""} 
              onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} 
              placeholder="0"
            />
            <p className="text-[7px] text-slate-500 mt-1">Stock en uso disponible: {stocksUsoPorItem[datos.item] || 0}</p>
          </div>

          <div className="bg-green-900/10 p-4 rounded-lg border border-green-900/30 text-center">
            <label className="text-[9px] font-black text-green-500 uppercase block mb-1">
              ENTREGA LIMPIA AL PAÑOL (Lavadero → Pañol)
            </label>
            <input 
              type="number" 
              className="bg-transparent w-full text-4xl font-black text-green-400 outline-none text-center" 
              value={datos.carga_lavadero || ""} 
              onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} 
              placeholder="0"
            />
            <p className="text-[7px] text-slate-500 mt-1">Stock en lavadero disponible: {stocksLavaderoPorItem[datos.item] || 0}</p>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
            <p className="text-[9px] font-black text-slate-500 uppercase mb-2">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-blue-400 outline-none"
              rows="2" 
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={registrando}
            className={`w-full p-4 rounded-lg font-black uppercase text-sm transition-all ${registrando ? 'bg-slate-600 cursor-not-allowed' : 'bg-blue-600 active:scale-95'}`}
          >
            {registrando ? 'REGISTRANDO...' : 'Registrar Movimiento'}
          </button>
        </form>
      ) : (
        <form onSubmit={registrarEntregaPiso} className="space-y-3">
          <select 
            className="w-full bg-slate-900 p-3 rounded-lg border border-slate-800 font-black text-blue-400 outline-none" 
            value={datos.item} 
            onChange={e => setDatos({...datos, item: e.target.value})}
          >
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>

          <div className="grid grid-cols-3 gap-2 bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
            <div>
              <p className="text-[7px] text-green-500 uppercase">Pañol</p>
              <p className="text-lg font-black text-green-400">{stocksPorItem[datos.item] || 0}</p>
            </div>
            <div>
              <p className="text-[7px] text-yellow-500 uppercase">En Uso</p>
              <p className="text-lg font-black text-yellow-400">{stocksUsoPorItem[datos.item] || 0}</p>
            </div>
            <div>
              <p className="text-[7px] text-red-500 uppercase">Lavadero</p>
              <p className="text-lg font-black text-red-400">{stocksLavaderoPorItem[datos.item] || 0}</p>
            </div>
          </div>

          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
            <p className="text-[9px] font-black text-slate-500 mb-2 uppercase">ENCARGADO DE PISO</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                className="flex-1 bg-slate-950 p-2 rounded-lg border border-slate-800 text-sm outline-none"
                value={busquedaDni}
                onChange={(e) => setBusquedaDni(e.target.value)}
                placeholder="DNI"
              />
              <button 
                type="button" 
                onClick={buscarEnfermero} 
                className="bg-blue-600 px-3 rounded-lg text-[9px] font-black uppercase"
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

          <div className="bg-orange-900/10 p-4 rounded-lg border border-orange-900/30">
            <label className="text-[9px] font-black text-orange-500 uppercase block text-center mb-2">
              CANTIDAD A ENTREGAR AL PISO (Pañol → Uso)
            </label>
            <input 
              type="number" 
              className="w-full bg-slate-950 p-3 rounded-lg text-4xl text-center font-black text-orange-400 outline-none border border-orange-900/20" 
              placeholder="0" 
              value={datos.entrega_piso || ""} 
              onChange={e => setDatos({...datos, entrega_piso: e.target.value})} 
            />
            <p className="text-[7px] text-slate-500 text-center mt-2">
              Stock en pañol: {stocksPorItem[datos.item] || 0}
            </p>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
            <p className="text-[9px] font-black text-slate-500 uppercase mb-2">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-blue-400 outline-none"
              rows="2" 
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={!enfermeroEncontrado || registrando}
            className={`w-full p-4 rounded-lg font-black uppercase text-sm transition-all ${(!enfermeroEncontrado || registrando) ? 'bg-slate-600 cursor-not-allowed opacity-50' : 'bg-blue-600 active:scale-95'}`}
          >
            {registrando ? 'REGISTRANDO...' : 'Entregar al Piso'}
          </button>
        </form>
      )}

      {notificacion.visible && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-blue-600 p-6 rounded-lg text-center shadow-2xl">
             <p className="text-white font-black uppercase text-xs tracking-wider">{notificacion.mensaje}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormularioPiso;