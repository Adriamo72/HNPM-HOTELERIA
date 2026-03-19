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
  
  // Estado para el formulario de habitación
  const [itemsHabitacion, setItemsHabitacion] = useState([
    { item: 'SABANAS', cantidadLimpia: 0, cantidadSucia: 0 },
    { item: 'TOALLAS', cantidadLimpia: 0, cantidadSucia: 0 },
    { item: 'TOALLONES', cantidadLimpia: 0, cantidadSucia: 0 },
    { item: 'FRAZADAS', cantidadLimpia: 0, cantidadSucia: 0 },
    { item: 'CUBRECAMAS', cantidadLimpia: 0, cantidadSucia: 0 }
  ]);

  useEffect(() => {
    console.log("=== FormularioPiso montado ===");
    console.log("slugPiso:", slugPiso);
    console.log("modoAcceso:", modoAcceso);
    console.log("perfilUsuario:", perfilUsuario);
    
    if (slugPiso) {
      cargarContexto();
    } else {
      console.error("❌ No hay slug de piso");
      setCargando(false);
    }
  }, [slugPiso]);

  const cargarContexto = async () => {
    setCargando(true);
    
    try {
      console.log("Cargando contexto para slug:", slugPiso, "modo:", modo);
      
      let pisoData = null;
      let habitacionData = null;

      // PASO 1: Si es habitación, buscar primero en habitaciones_especiales
      if (modo === 'habitacion') {
        console.log("🔍 Buscando habitación especial con slug:", slugPiso);
        
        const { data: habitacion, error: errorHabitacion } = await supabase
          .from('habitaciones_especiales')
          .select('*, pisos(*)')
          .eq('slug', slugPiso)
          .maybeSingle();

        if (errorHabitacion) {
          console.error("Error buscando habitación:", errorHabitacion);
        }

        if (habitacion) {
          console.log("✅ Habitación encontrada:", habitacion);
          habitacionData = habitacion;
          pisoData = habitacion.pisos;
        }
      }

      // PASO 2: Si no encontramos habitación, buscar en pisos
      if (!pisoData) {
        console.log("🔍 Buscando piso con slug:", slugPiso);
        
        const { data: piso, error } = await supabase
          .from('pisos')
          .select('*')
          .eq('slug', slugPiso)
          .single();

        if (error) {
          console.error("❌ Error cargando piso:", error);
          mostrarSplash("ERROR: Sector no encontrado");
          setCargando(false);
          return;
        }

        pisoData = piso;
        console.log("✅ Piso encontrado:", pisoData);
      }

      if (pisoData) {
        setPiso(pisoData);
        if (habitacionData) {
          setHabitacionEspecial(habitacionData);
        }
        
        // Cargar stocks para todos los items
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
        
        console.log("📊 Stocks cargados:", stocksTemp);
        setStocksPorItem(stocksTemp);
      }
    } catch (error) {
      console.error("Error inesperado:", error);
      mostrarSplash("ERROR INESPERADO");
    } finally {
      setCargando(false);
    }
  };

  const mostrarSplash = (msj) => {
    setNotificacion({ visible: true, mensaje: msj });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  // Función para actualizar cantidades en habitación
  const actualizarItemHabitacion = (index, campo, valor) => {
    const nuevosItems = [...itemsHabitacion];
    nuevosItems[index][campo] = parseInt(valor) || 0;
    setItemsHabitacion(nuevosItems);
  };

  // Función para registrar cambio en habitación - VERSIÓN CORREGIDA
  const ejecutarCambioHabitacion = async () => {
    if (!piso?.id) {
      mostrarSplash("ERROR: Piso no identificado");
      return;
    }

    // Verificar que haya al menos un item con cantidad > 0
    const hayMovimientos = itemsHabitacion.some(
      item => item.cantidadLimpia > 0 || item.cantidadSucia > 0
    );

    if (!hayMovimientos) {
      mostrarSplash("INGRESE AL MENOS UN ITEM");
      return;
    }

    try {
      console.log("Registrando cambio en habitación:", itemsHabitacion);
      console.log("Piso ID:", piso.id);
      console.log("Usuario:", perfilUsuario);
      
      let registrosExitosos = 0;
      
      for (const itemConf of itemsHabitacion) {
        if (itemConf.cantidadLimpia === 0 && itemConf.cantidadSucia === 0) continue;

        // Obtener stock actual para este item
        const stockActual = stocksPorItem[itemConf.item] || 0;
        
        // Calcular nuevo stock (restamos lo que entregamos)
        const nuevoStock = stockActual - itemConf.cantidadLimpia;

        // IMPORTANTE: Usar los campos correctos según tu esquema
        const movimiento = {
          piso_id: piso.id,
          dni_pañolero: perfilUsuario.dni,
          // dni_enfermero no es obligatorio para habitación
          item: itemConf.item,
          // Para entrega a piso/habitación usamos egreso_limpio
          egreso_limpio: itemConf.cantidadLimpia,
          // Para ropa sucia retirada
          retirado_sucio: itemConf.cantidadSucia,
          // Stock actualizado
          stock_fisico_piso: nuevoStock,
          // Novedades
          novedades: novedades,
          // Marcar como cambio de habitación
          es_cambio_habitacion: true
        };

        // Si hay habitación especial, agregar el ID
        if (habitacionEspecial) {
          movimiento.habitacion_id = habitacionEspecial.id;
        }

        console.log("Insertando movimiento:", JSON.stringify(movimiento, null, 2));

        const { data, error } = await supabase
          .from('movimientos_stock')
          .insert([movimiento])
          .select();

        if (error) {
          console.error(`❌ Error insertando movimiento para ${itemConf.item}:`, error);
          console.error("Detalle del error:", error);
          mostrarSplash(`ERROR en ${itemConf.item}`);
        } else {
          console.log(`✅ Movimiento registrado para ${itemConf.item}:`, data);
          registrosExitosos++;
          // Actualizar stock local
          setStocksPorItem(prev => ({
            ...prev,
            [itemConf.item]: nuevoStock
          }));
        }
      }
      
      if (registrosExitosos > 0) {
        mostrarSplash(`${registrosExitosos} ITEMS REGISTRADOS`);
        setNovedades("Sin novedades");
        
        // Resetear cantidades
        setItemsHabitacion(itemsHabitacion.map(item => ({
          ...item,
          cantidadLimpia: 0,
          cantidadSucia: 0
        })));
      }
      
    } catch (error) {
      console.error("Error en cambio de habitación:", error);
      mostrarSplash("ERROR EN REGISTRO");
    }
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
        const stockActual = stocksPorItem[i.item] || 0;
        const nuevoStock = stockActual - i.cant;

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

    const stockActual = stocksPorItem[datos.item] || 0;
    let nuevoStock = stockActual;

    if (modo === 'lavadero') {
      nuevoStock = stockActual + (parseInt(datos.carga_lavadero || 0));
    } else if (modo === 'piso') {
      nuevoStock = stockActual - (parseInt(datos.entrega_piso || 0));
    }

    const movimiento = {
      piso_id: piso.id,
      dni_pañolero: perfilUsuario.dni,
      dni_enfermero: modo === 'piso' ? enfermeroEncontrado?.dni : null,
      item: datos.item,
      entregado_limpio: modo === 'lavadero' ? parseInt(datos.carga_lavadero || 0) : 0,
      egreso_limpio: modo === 'piso' ? parseInt(datos.entrega_piso || 0) : 0,
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio || 0) : 0,
      stock_fisico_piso: nuevoStock,
      novedades: novedades
    };

    console.log("Enviando registro:", movimiento);

    const { error } = await supabase.from('movimientos_stock').insert([movimiento]);

    if (!error) {
      mostrarSplash("REGISTRO EXITOSO");
      setDatos({ item: datos.item, carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
      setStocksPorItem({...stocksPorItem, [datos.item]: nuevoStock});
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
      .in('rol', ['enfermero', 'ADMIN'])
      .maybeSingle();
    
    if (error) {
      console.error("Error buscando enfermero:", error);
    }
    
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
          <p className="text-blue-400 font-black text-sm mb-2">SENTINEL HNPM</p>
          <p className="text-slate-500 italic text-xs">
            {modo === 'habitacion' ? 'Buscando habitación' : 'Cargando sector'} {slugPiso}...
          </p>
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
            className="mt-4 bg-slate-800 px-4 py-2 rounded-xl text-xs font-black hover:bg-slate-700 transition-all"
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
        <div className="space-y-4 animate-in fade-in">
          {/* Selector de items para habitación */}
          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-4">ITEMS PARA HABITACIÓN</p>
            
            {itemsHabitacion.map((itemConf, index) => (
              <div key={itemConf.item} className="mb-6 last:mb-0 border-b border-slate-800 pb-4 last:border-0">
                <p className="text-sm font-black text-blue-400 mb-3">{itemConf.item}</p>
                
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
            
            {/* Resumen de stock disponible */}
            <div className="mt-4 pt-4 border-t border-slate-800">
              <p className="text-[8px] text-slate-500 font-black uppercase mb-2">STOCK DISPONIBLE EN PAÑOL</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {ITEMS_HOTELERIA.map(item => (
                  <div key={item} className="bg-slate-950 p-2 rounded-lg">
                    <span className="text-[7px] text-slate-400 block">{item}</span>
                    <span className="text-sm font-black text-blue-400">{stocksPorItem[item] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Novedades */}
          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Novedades</p>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-blue-400 outline-none"
              rows="2" 
              placeholder="Ej: Faltó toalla sucia..."
              value={novedades} 
              onChange={(e) => setNovedades(e.target.value)}
            />
          </div>

          {/* Botón de registro */}
          <button 
            onClick={ejecutarCambioHabitacion} 
            className="w-full bg-blue-600 p-6 rounded-[2.5rem] font-black uppercase text-sm shadow-2xl active:scale-95 transition-all hover:bg-blue-500"
          >
            Registrar Cambio en Habitación
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
            <span className="text-5xl font-black text-blue-400">{stocksPorItem[datos.item] || 0}</span>
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
                    className="bg-blue-600 px-4 rounded-xl text-[10px] font-black uppercase hover:bg-blue-500 transition-all"
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
            className="w-full p-5 rounded-3xl bg-blue-600 text-white font-black uppercase text-sm shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-all"
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