// components/FormularioPiso.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

const FormularioPiso = ({ perfilUsuario, slugPiso, modoAcceso }) => {
  const [piso, setPiso] = useState(null);
  const [habitacionEspecial, setHabitacionEspecial] = useState(null);
  const modo = modoAcceso || 'piso';
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
  
  // Estados para el formulario de habitación
  const [itemSeleccionadoHabitacion, setItemSeleccionadoHabitacion] = useState('SABANAS');
  const [cantidadHabitacion, setCantidadHabitacion] = useState(0);

  useEffect(() => {
    if (slugPiso) {
      cargarContexto();
    } else {
      setCargando(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugPiso]);

  const mostrarSplash = (msj) => {
    setNotificacion({ visible: true, mensaje: msj });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

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
        
        const stocksTemp = {};
        const stocksUsoTemp = {};
        const stocksLavaderoTemp = {};
        
        for (const item of ITEMS_HOTELERIA) {
          const { data: stockData, error } = await supabase
            .from('stock_piso')
            .select('stock_pañol, stock_en_uso, stock_lavadero')
            .eq('piso_id', pisoData.id)
            .eq('item', item)
            .maybeSingle();
          
          if (error) {
            console.error(`Error cargando stock para ${item}:`, error);
          }
          
          if (!stockData) {
            const { error: insertError } = await supabase
              .from('stock_piso')
              .insert({
                piso_id: pisoData.id,
                item: item,
                stock_pañol: 0,
                stock_en_uso: 0,
                stock_lavadero: 0,
                updated_at: new Date()
              });
            
            if (insertError) {
              console.error(`Error creando registro para ${item}:`, insertError);
            }
            
            stocksTemp[item] = 0;
            stocksUsoTemp[item] = 0;
            stocksLavaderoTemp[item] = 0;
          } else {
            stocksTemp[item] = stockData.stock_pañol || 0;
            stocksUsoTemp[item] = stockData.stock_en_uso || 0;
            stocksLavaderoTemp[item] = stockData.stock_lavadero || 0;
          }
        }
        
        setStocksPorItem(stocksTemp);
        setStocksUsoPorItem(stocksUsoTemp);
        setStocksLavaderoPorItem(stocksLavaderoTemp);
      }
    } catch (error) {
      console.error("Error en cargarContexto:", error);
      mostrarSplash("ERROR INESPERADO");
    } finally {
      setCargando(false);
    }
  };

  const actualizarStockCompleto = async (item, nuevoPañol, nuevoUso, nuevoLavadero) => {
    const { error } = await supabase
      .from('stock_piso')
      .upsert({
        piso_id: piso.id,
        item: item,
        stock_pañol: nuevoPañol,
        stock_en_uso: nuevoUso,
        stock_lavadero: nuevoLavadero,
        updated_at: new Date()
      }, { onConflict: 'piso_id,item' });
    
    if (error) {
      console.error("Error actualizando stock_piso:", error);
      return false;
    }
    return true;
  };

  const registrarHabitacion = async () => {
    if (!piso?.id) {
      mostrarSplash("ERROR: Piso no identificado");
      return;
    }

    if (cantidadHabitacion <= 0) {
      mostrarSplash("INGRESE UNA CANTIDAD VÁLIDA");
      return;
    }

    const stockActualPañol = stocksPorItem[itemSeleccionadoHabitacion] || 0;
    const nuevoStockPañol = stockActualPañol - cantidadHabitacion;
    const nuevoStockUso = (stocksUsoPorItem[itemSeleccionadoHabitacion] || 0) + cantidadHabitacion;

    if (nuevoStockPañol < 0) {
      mostrarSplash(`⚠️ Stock insuficiente de ${itemSeleccionadoHabitacion}. Disponible: ${stockActualPañol}`);
      return;
    }

    setRegistrando(true);

    const movimiento = {
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      item: itemSeleccionadoHabitacion,
      egreso_limpio: cantidadHabitacion,
      stock_fisico_piso: nuevoStockPañol,
      novedades: novedades,
      es_cambio_habitacion: true
    };

    if (habitacionEspecial) {
      movimiento.habitacion_id = habitacionEspecial.id;
    }

    const { error: movError } = await supabase.from('movimientos_stock').insert([movimiento]);
    
    if (movError) {
      console.error("Error:", movError);
      mostrarSplash("❌ ERROR EN REGISTRO");
      setRegistrando(false);
      return;
    }

    const ok = await actualizarStockCompleto(itemSeleccionadoHabitacion, nuevoStockPañol, nuevoStockUso, stocksLavaderoPorItem[itemSeleccionadoHabitacion] || 0);
    
    if (ok) {
      setStocksPorItem(prev => ({ ...prev, [itemSeleccionadoHabitacion]: nuevoStockPañol }));
      setStocksUsoPorItem(prev => ({ ...prev, [itemSeleccionadoHabitacion]: nuevoStockUso }));
      mostrarSplash(`✅ ${cantidadHabitacion} ${itemSeleccionadoHabitacion} entregados`);
      setCantidadHabitacion(0);
      setNovedades("Sin novedades");
    } else {
      mostrarSplash("❌ ERROR AL ACTUALIZAR STOCK");
    }
    
    setRegistrando(false);
  };

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

        if (nuevoStockPañol < 0) {
          mostrarSplash(`⚠️ Stock insuficiente de ${i.item}. Disponible: ${stockActualPañol}`);
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
          continue;
        }

        const ok = await actualizarStockCompleto(i.item, nuevoStockPañol, nuevoStockUso, stocksLavaderoPorItem[i.item] || 0);
        
        if (ok) {
          exitosos.push(i.item);
          setStocksPorItem(prev => ({ ...prev, [i.item]: nuevoStockPañol }));
          setStocksUsoPorItem(prev => ({ ...prev, [i.item]: nuevoStockUso }));
        } else {
          errores = true;
        }
      }
      
      if (!errores && exitosos.length > 0) {
        mostrarSplash(`✅ CAMBIO ESTÁNDAR: ${exitosos.join(', ')}`);
        setNovedades("Sin novedades");
      } else if (exitosos.length > 0) {
        mostrarSplash(`⚠️ PARCIAL: ${exitosos.join(', ')}`);
      } else {
        mostrarSplash("❌ ERROR: Stock insuficiente");
      }
    } catch (error) {
      console.error(error);
      mostrarSplash("ERROR EN REGISTRO");
    } finally {
      setRegistrando(false);
    }
  };

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
    let nuevoStockUso = stocksUsoPorItem[datos.item] || 0;
    let nuevoStockLavadero = stocksLavaderoPorItem[datos.item] || 0;
    let mensajes = [];
    let ajusteAutomatico = false;

    if (salidaSucio > 0) {
      if (nuevoStockUso >= salidaSucio) {
        nuevoStockUso -= salidaSucio;
        nuevoStockLavadero += salidaSucio;
        mensajes.push(`${salidaSucio} sucios`);
      } else {
        const deficit = salidaSucio - nuevoStockUso;
        nuevoStockPañol -= deficit;
        nuevoStockUso = 0;
        nuevoStockLavadero += salidaSucio;
        ajusteAutomatico = true;
        mensajes.push(`${salidaSucio} sucios (${deficit} ajustado)`);
      }
    }

    if (ingresoLimpio > 0) {
      if (nuevoStockLavadero >= ingresoLimpio) {
        nuevoStockLavadero -= ingresoLimpio;
        nuevoStockPañol += ingresoLimpio;
        mensajes.push(`${ingresoLimpio} limpios`);
      } else {
        const deficit = ingresoLimpio - nuevoStockLavadero;
        nuevoStockLavadero = 0;
        nuevoStockPañol += ingresoLimpio;
        ajusteAutomatico = true;
        mensajes.push(`${ingresoLimpio} limpios (${deficit} nuevo ingreso)`);
      }
    }

    if (nuevoStockPañol < 0) {
      mostrarSplash(`❌ Error: Stock en pañol negativo. Contacte administración.`);
      setRegistrando(false);
      return;
    }

    const movimiento = {
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      item: datos.item,
      entregado_limpio: ingresoLimpio,
      retirado_sucio: salidaSucio,
      stock_fisico_piso: nuevoStockPañol,
      novedades: novedades + (ajusteAutomatico ? " [Ajuste automático]" : "")
    };

    const { error: movError } = await supabase.from('movimientos_stock').insert([movimiento]);
    
    if (movError) {
      mostrarSplash("❌ ERROR EN REGISTRO");
      setRegistrando(false);
      return;
    }

    const ok = await actualizarStockCompleto(datos.item, nuevoStockPañol, nuevoStockUso, nuevoStockLavadero);
    
    if (ok) {
      setStocksPorItem(prev => ({ ...prev, [datos.item]: nuevoStockPañol }));
      setStocksUsoPorItem(prev => ({ ...prev, [datos.item]: nuevoStockUso }));
      setStocksLavaderoPorItem(prev => ({ ...prev, [datos.item]: nuevoStockLavadero }));
      mostrarSplash(`✅ ${datos.item}: ${mensajes.join(' / ')}${ajusteAutomatico ? ' ⚠️ Ajuste' : ''}`);
      setDatos({ ...datos, carga_lavadero: 0, retirado_sucio: 0 });
      setNovedades("Sin novedades");
    } else {
      mostrarSplash("❌ ERROR AL ACTUALIZAR STOCK");
    }
    
    setRegistrando(false);
  };

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

    if (nuevoStockPañol < 0) {
      mostrarSplash(`❌ Stock insuficiente. Disponible: ${stockActualPañol}`);
      setRegistrando(false);
      return;
    }

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

    const ok = await actualizarStockCompleto(datos.item, nuevoStockPañol, nuevoStockUso, stocksLavaderoPorItem[datos.item] || 0);
    
    if (ok) {
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

  const buscarEnfermero = async () => {
    if (busquedaDni.length < 7) {
      mostrarSplash("DNI inválido");
      return;
    }
    
    const { data } = await supabase
      .from('personal')
      .select('*')
      .eq('dni', busquedaDni)
      .in('rol', ['encargado_piso', 'enfermero'])
      .maybeSingle();
    
    setEnfermeroEncontrado(data);
    if (!data) {
      mostrarSplash("DNI NO REGISTRADO");
    } else {
      mostrarSplash(`${data.jerarquia} ${data.apellido} encontrado`);
    }
  };

  if (cargando) {
    return (
      <div className="p-10 text-white text-center">
        <div className="animate-pulse">
          <p className="text-blue-400 font-black text-base mb-2">SENTINEL HNPM</p>
          <p className="text-slate-500 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!piso) {
    return (
      <div className="p-10 text-white text-center">
        <div className="bg-red-900/20 p-8 rounded-xl border border-red-800">
          <p className="text-red-400 font-black text-lg mb-2">ERROR DE ACCESO</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-4 bg-slate-800 px-6 py-2 rounded-lg text-sm font-black"
          >
            VOLVER AL INICIO
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-950 min-h-screen text-slate-200 pb-20 font-sans">
      <div className="mb-6 bg-slate-900/50 p-4 rounded-xl border border-blue-900/30">
        <p className="text-xs text-blue-500 font-black uppercase tracking-wider">
          {modo === 'habitacion' ? 'SERVICIO HABITACIÓN' : modo === 'lavadero' ? 'CONTROL LAVADERO' : 'CONTROL PAÑOL'}
        </p>
        <h3 className="text-xl font-black uppercase">{piso.nombre_piso}</h3>
        {habitacionEspecial && (
          <p className="text-sm text-blue-400 mt-1 uppercase font-bold">
            Habitación: {habitacionEspecial.nombre}
          </p>
        )}
      </div>

      {modo === 'habitacion' ? (
        <div className="space-y-4">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <p className="text-sm font-black text-slate-500 uppercase mb-4">ITEM PARA ENTREGAR</p>
            
            <select 
              className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 font-black text-blue-400 outline-none text-lg mb-4"
              value={itemSeleccionadoHabitacion}
              onChange={(e) => setItemSeleccionadoHabitacion(e.target.value)}
            >
              {ITEMS_HOTELERIA.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            <div>
              <label className="text-sm font-black text-green-500 uppercase block mb-2">
                CANTIDAD
              </label>
              <input
                type="number"
                min="0"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-3xl text-green-400 font-black text-center outline-none"
                value={cantidadHabitacion || ""}
                onChange={(e) => setCantidadHabitacion(parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <p className="text-sm font-black text-slate-500 uppercase mb-3">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-blue-400 outline-none"
              rows="2" 
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
              placeholder="Ej: No había toallón sucio..."
            />
          </div>

          <button 
            onClick={ejecutarCambioEstandar}
            disabled={registrando}
            className={`w-full p-4 rounded-xl font-black uppercase text-base transition-all ${registrando ? 'bg-slate-600 cursor-not-allowed' : 'bg-green-600 active:scale-95'}`}
          >
            {registrando ? 'REGISTRANDO...' : 'Cambio Estándar (2 Sábanas + 1 Toalla + 1 Toallón)'}
          </button>

          <button 
            onClick={registrarHabitacion} 
            disabled={registrando || cantidadHabitacion <= 0}
            className={`w-full p-5 rounded-xl font-black uppercase text-base transition-all ${(registrando || cantidadHabitacion <= 0) ? 'bg-slate-600 cursor-not-allowed opacity-50' : 'bg-blue-600 active:scale-95'}`}
          >
            {registrando ? 'REGISTRANDO...' : 'Registrar Entrega'}
          </button>
        </div>
      ) : modo === 'lavadero' ? (
        <form onSubmit={registrarLavadero} className="space-y-4">
          <select 
            className="w-full bg-slate-900 p-4 rounded-xl border border-slate-800 font-black text-blue-400 outline-none text-lg" 
            value={datos.item} 
            onChange={e => setDatos({...datos, item: e.target.value})}
          >
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>

          <div className="grid grid-cols-3 gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 text-center">
            <div>
              <p className="text-xs text-green-500 uppercase font-black">PAÑOL</p>
              <p className="text-3xl font-black text-green-400">{stocksPorItem[datos.item] || 0}</p>
            </div>
            <div>
              <p className="text-xs text-yellow-500 uppercase font-black">EN USO</p>
              <p className="text-3xl font-black text-yellow-400">{stocksUsoPorItem[datos.item] || 0}</p>
            </div>
            <div>
              <p className="text-xs text-red-500 uppercase font-black">LAVADERO</p>
              <p className="text-3xl font-black text-red-400">{stocksLavaderoPorItem[datos.item] || 0}</p>
            </div>
          </div>

          <div className="bg-red-900/10 p-5 rounded-xl border border-red-900/30 text-center">
            <label className="text-sm font-black text-red-500 uppercase block mb-2">
              RECIBE SUCIO DEL PISO (Uso → Lavadero)
            </label>
            <input 
              type="number" 
              className="bg-transparent w-full text-5xl font-black text-red-400 outline-none text-center" 
              value={datos.retirado_sucio || ""} 
              onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} 
              placeholder="0"
            />
            <p className="text-xs text-slate-500 mt-2">Stock en uso: {stocksUsoPorItem[datos.item] || 0}</p>
          </div>

          <div className="bg-green-900/10 p-5 rounded-xl border border-green-900/30 text-center">
            <label className="text-sm font-black text-green-500 uppercase block mb-2">
              ENTREGA LIMPIA AL PAÑOL (Lavadero → Pañol)
            </label>
            <input 
              type="number" 
              className="bg-transparent w-full text-5xl font-black text-green-400 outline-none text-center" 
              value={datos.carga_lavadero || ""} 
              onChange={e => setDatos({...datos, carga_lavadero: e.target.value})} 
              placeholder="0"
            />
            <p className="text-xs text-slate-500 mt-2">Stock en lavadero: {stocksLavaderoPorItem[datos.item] || 0}</p>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <p className="text-sm font-black text-slate-500 uppercase mb-3">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-blue-400 outline-none"
              rows="3" 
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={registrando}
            className={`w-full p-5 rounded-xl font-black uppercase text-base transition-all ${registrando ? 'bg-slate-600 cursor-not-allowed' : 'bg-blue-600 active:scale-95'}`}
          >
            {registrando ? 'REGISTRANDO...' : 'Registrar Movimiento'}
          </button>
        </form>
      ) : (
        <form onSubmit={registrarEntregaPiso} className="space-y-4">
          <select 
            className="w-full bg-slate-900 p-4 rounded-xl border border-slate-800 font-black text-blue-400 outline-none text-lg" 
            value={datos.item} 
            onChange={e => setDatos({...datos, item: e.target.value})}
          >
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>

          <div className="grid grid-cols-3 gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 text-center">
            <div>
              <p className="text-xs text-green-500 uppercase font-black">PAÑOL</p>
              <p className="text-3xl font-black text-green-400">{stocksPorItem[datos.item] || 0}</p>
            </div>
            <div>
              <p className="text-xs text-yellow-500 uppercase font-black">EN USO</p>
              <p className="text-3xl font-black text-yellow-400">{stocksUsoPorItem[datos.item] || 0}</p>
            </div>
            <div>
              <p className="text-xs text-red-500 uppercase font-black">LAVADERO</p>
              <p className="text-3xl font-black text-red-400">{stocksLavaderoPorItem[datos.item] || 0}</p>
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
            <p className="text-sm font-black text-slate-500 mb-3 uppercase">ENCARGADO DE PISO</p>
            <div className="flex gap-3">
              <input 
                type="text" 
                className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 text-base outline-none font-mono"
                value={busquedaDni}
                onChange={(e) => setBusquedaDni(e.target.value)}
                placeholder="DNI del encargado"
              />
              <button 
                type="button" 
                onClick={buscarEnfermero} 
                className="bg-blue-600 px-5 rounded-xl text-sm font-black uppercase hover:bg-blue-500 transition-all"
              >
                Buscar
              </button>
            </div>
            {enfermeroEncontrado && (
              <div className="mt-3 p-3 bg-green-900/30 rounded-xl border border-green-800/50">
                <p className="text-green-400 text-sm font-bold">
                  📋 {enfermeroEncontrado.jerarquia} {enfermeroEncontrado.apellido}, {enfermeroEncontrado.nombre}
                </p>
                <p className="text-green-500/70 text-[10px] mt-1">DNI: {enfermeroEncontrado.dni}</p>
              </div>
            )}
          </div>

          <div className="bg-orange-900/10 p-5 rounded-xl border border-orange-900/30">
            <label className="text-sm font-black text-orange-500 uppercase block text-center mb-3">
              CANTIDAD A ENTREGAR AL PISO (Pañol → Uso)
            </label>
            <input 
              type="number" 
              className="w-full bg-slate-950 p-4 rounded-xl text-5xl text-center font-black text-orange-400 outline-none border border-orange-900/20" 
              placeholder="0" 
              value={datos.entrega_piso || ""} 
              onChange={e => setDatos({...datos, entrega_piso: e.target.value})} 
            />
            <p className="text-sm text-slate-500 text-center mt-3">
              Stock en pañol: {stocksPorItem[datos.item] || 0}
            </p>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <p className="text-sm font-black text-slate-500 uppercase mb-3">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-blue-400 outline-none"
              rows="3" 
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={!enfermeroEncontrado || registrando}
            className={`w-full p-5 rounded-xl font-black uppercase text-base transition-all ${(!enfermeroEncontrado || registrando) ? 'bg-slate-600 cursor-not-allowed opacity-50' : 'bg-blue-600 active:scale-95'}`}
          >
            {registrando ? 'REGISTRANDO...' : 'Entregar al Piso'}
          </button>
        </form>
      )}

      {notificacion.visible && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-blue-600 p-8 rounded-xl text-center shadow-2xl">
             <p className="text-white font-black uppercase text-base tracking-wider">{notificacion.mensaje}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormularioPiso;