// components/FormularioPiso.jsx (versión con spinner)
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import useSpinner from '../hooks/useSpinner';
import SpinnerOverlay from '../components/SpinnerOverlay';

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
  const [datos, setDatos] = useState({ item: 'SABANAS', carga_lavadero: 0, entrega_piso: 0, retirado_sucio: 0 });
  const [cargando, setCargando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  
  // Estados para el formulario de habitación
  const [itemSeleccionadoHabitacion, setItemSeleccionadoHabitacion] = useState('SABANAS');
  const [cantidadHabitacion, setCantidadHabitacion] = useState(0);
  
  const { spinner, showLoading, showSuccess, showError, hideSpinner } = useSpinner();

  useEffect(() => {
    if (slugPiso) {
      cargarContexto();
    } else {
      setCargando(false);
    }
  }, [slugPiso]);

  const mostrarSplash = (msj) => {
    // Usamos el spinner para feedback
    if (msj.includes('✅')) {
      showSuccess(msj);
    } else if (msj.includes('❌') || msj.includes('ERROR')) {
      showError(msj);
    }
  };

  const cargarContexto = async () => {
    setCargando(true);
    showLoading('CARGANDO SECTOR...');
    
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
          showError('SECTOR NO ENCONTRADO');
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
        hideSpinner();
      }
    } catch (error) {
      console.error("Error en cargarContexto:", error);
      showError('ERROR INESPERADO');
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

  // ==================== REGISTRO HABITACIÓN ====================
  const registrarHabitacion = async () => {
    if (!piso?.id) {
      showError('PISO NO IDENTIFICADO');
      return;
    }

    if (cantidadHabitacion <= 0) {
      showError('INGRESE UNA CANTIDAD VÁLIDA');
      return;
    }

    const stockActualPañol = stocksPorItem[itemSeleccionadoHabitacion] || 0;
    const nuevoStockPañol = stockActualPañol - cantidadHabitacion;
    const nuevoStockUso = (stocksUsoPorItem[itemSeleccionadoHabitacion] || 0) + cantidadHabitacion;

    if (nuevoStockPañol < 0) {
      showError(`STOCK INSUFICIENTE DE ${itemSeleccionadoHabitacion}. DISPONIBLE: ${stockActualPañol}`);
      return;
    }

    setRegistrando(true);
    showLoading('REGISTRANDO ENTREGA...');

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
      showError('ERROR EN REGISTRO');
      setRegistrando(false);
      return;
    }

    const ok = await actualizarStockCompleto(itemSeleccionadoHabitacion, nuevoStockPañol, nuevoStockUso, stocksLavaderoPorItem[itemSeleccionadoHabitacion] || 0);
    
    if (ok) {
      setStocksPorItem(prev => ({ ...prev, [itemSeleccionadoHabitacion]: nuevoStockPañol }));
      setStocksUsoPorItem(prev => ({ ...prev, [itemSeleccionadoHabitacion]: nuevoStockUso }));
      showSuccess(`${cantidadHabitacion} ${itemSeleccionadoHabitacion} ENTREGADOS`);
      setCantidadHabitacion(0);
      setNovedades("Sin novedades");
    } else {
      showError('ERROR AL ACTUALIZAR STOCK');
    }
    
    setRegistrando(false);
  };

  // ==================== CAMBIO ESTÁNDAR HABITACIÓN ====================
  const ejecutarCambioEstandar = async () => {
    if (!piso?.id) {
      showError('PISO NO IDENTIFICADO');
      return;
    }

    setRegistrando(true);
    showLoading('REGISTRANDO CAMBIO ESTÁNDAR...');
    
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
          showError(`STOCK INSUFICIENTE DE ${i.item}. DISPONIBLE: ${stockActualPañol}`);
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
        showSuccess(`CAMBIO ESTÁNDAR: ${exitosos.join(', ')}`);
        setNovedades("Sin novedades");
      } else if (exitosos.length > 0) {
        showSuccess(`PARCIAL: ${exitosos.join(', ')}`);
      } else {
        showError('STOCK INSUFICIENTE');
      }
    } catch (error) {
      console.error(error);
      showError('ERROR EN REGISTRO');
    } finally {
      setRegistrando(false);
    }
  };

  // ==================== REGISTRO LAVADERO ====================
  const registrarLavadero = async (e) => {
    e.preventDefault();
    
    if (!piso?.id) {
      showError('PISO NO IDENTIFICADO');
      return;
    }

    const ingresoLimpio = parseInt(datos.carga_lavadero || 0);
    const salidaSucio = parseInt(datos.retirado_sucio || 0);

    if (ingresoLimpio === 0 && salidaSucio === 0) {
      showError('INGRESE AL MENOS UNA CANTIDAD');
      return;
    }

    setRegistrando(true);
    showLoading('REGISTRANDO MOVIMIENTO...');

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
      showError('STOCK EN PAÑOL NEGATIVO. CONTACTE ADMINISTRACIÓN');
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
      showError('ERROR EN REGISTRO');
      setRegistrando(false);
      return;
    }

    const ok = await actualizarStockCompleto(datos.item, nuevoStockPañol, nuevoStockUso, nuevoStockLavadero);
    
    if (ok) {
      setStocksPorItem(prev => ({ ...prev, [datos.item]: nuevoStockPañol }));
      setStocksUsoPorItem(prev => ({ ...prev, [datos.item]: nuevoStockUso }));
      setStocksLavaderoPorItem(prev => ({ ...prev, [datos.item]: nuevoStockLavadero }));
      showSuccess(`${datos.item}: ${mensajes.join(' / ')}${ajusteAutomatico ? ' ⚠️ AJUSTE' : ''}`);
      setDatos({ ...datos, carga_lavadero: 0, retirado_sucio: 0 });
      setNovedades("Sin novedades");
    } else {
      showError('ERROR AL ACTUALIZAR STOCK');
    }
    
    setRegistrando(false);
  };

  // ==================== REGISTRO PAÑOL - ENTREGA A PISO ====================
  const registrarEntregaPiso = async (e) => {
    e.preventDefault();
    
    if (!piso?.id) {
      showError('PISO NO IDENTIFICADO');
      return;
    }

    if (!enfermeroEncontrado) {
      showError('DEBE BUSCAR UN ENCARGADO DE PISO');
      return;
    }

    const cantidadEntregada = parseInt(datos.entrega_piso || 0);
    if (cantidadEntregada <= 0) {
      showError('INGRESE UNA CANTIDAD VÁLIDA');
      return;
    }

    setRegistrando(true);
    showLoading('REGISTRANDO ENTREGA...');

    const stockActualPañol = stocksPorItem[datos.item] || 0;
    const nuevoStockPañol = stockActualPañol - cantidadEntregada;
    const nuevoStockUso = (stocksUsoPorItem[datos.item] || 0) + cantidadEntregada;

    if (nuevoStockPañol < 0) {
      showError(`STOCK INSUFICIENTE. DISPONIBLE: ${stockActualPañol}`);
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
      showError('ERROR EN REGISTRO');
      setRegistrando(false);
      return;
    }

    const ok = await actualizarStockCompleto(datos.item, nuevoStockPañol, nuevoStockUso, stocksLavaderoPorItem[datos.item] || 0);
    
    if (ok) {
      setStocksPorItem(prev => ({ ...prev, [datos.item]: nuevoStockPañol }));
      setStocksUsoPorItem(prev => ({ ...prev, [datos.item]: nuevoStockUso }));
      showSuccess(`${cantidadEntregada} ${datos.item} ENTREGADOS A ${enfermeroEncontrado.apellido}`);
      setDatos({ ...datos, entrega_piso: 0 });
      setBusquedaDni('');
      setEnfermeroEncontrado(null);
      setNovedades("Sin novedades");
    } else {
      showError('ERROR AL ACTUALIZAR STOCK');
    }
    
    setRegistrando(false);
  };

  const buscarEnfermero = async () => {
    if (busquedaDni.length < 7) {
      showError('DNI INVÁLIDO');
      return;
    }
    
    showLoading('BUSCANDO PERSONAL...');
    
    const { data } = await supabase
      .from('personal')
      .select('*')
      .eq('dni', busquedaDni)
      .in('rol', ['enfermero', 'ADMIN'])
      .maybeSingle();
    
    setEnfermeroEncontrado(data);
    hideSpinner();
    
    if (!data) {
      showError('DNI NO REGISTRADO');
    } else {
      showSuccess(`${data.jerarquia} ${data.apellido}`);
    }
  };

  const totalRealPorItem = (item) => {
    return (stocksPorItem[item] || 0) + (stocksUsoPorItem[item] || 0) + (stocksLavaderoPorItem[item] || 0);
  };

  if (spinner.visible) {
    return <SpinnerOverlay mensaje={spinner.mensaje} tipo={spinner.tipo} />;
  }

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

  // ==================== RENDER ====================
  return (
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      {/* Tabs */}
      <div className="flex gap-3 mb-8 bg-slate-900 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button 
          onClick={() => setActiveTab('croquis')} 
          className={`px-8 py-2.5 rounded-lg text-sm font-semibold uppercase transition-all ${activeTab === 'croquis' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Hotelería
        </button>
        <button 
          onClick={() => setActiveTab('historial')} 
          className={`px-8 py-2.5 rounded-lg text-sm font-semibold uppercase transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Monitor
        </button>
        <button 
          onClick={() => setActiveTab('admin')} 
          className={`px-8 py-2.5 rounded-lg text-sm font-semibold uppercase transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Administración
        </button>
      </div>
      {/* Panel CROQUIS - Monitor de ocupacion*/}
      {activeTab === 'croquis' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">
              HOTELERIA
            </h2>
            <select
              value={pisoSeleccionado}
              onChange={(e) => {
                setPisoSeleccionado(e.target.value);
                setCroquisKey(prev => prev + 1); // Forzar recreación del croquis
              }}
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white"
            >
              <option value="">Seleccionar piso...</option>
              {pisos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre_piso}</option>
              ))}
            </select>
          </div>
          
          {pisoSeleccionado ? (
            <CroquisPiso
              key={croquisKey}  // 👈 Usar la key que cambia con cada selección
              pisoId={pisoSeleccionado}
              pisoNombre={pisos.find(p => String(p.id) === String(pisoSeleccionado))?.nombre_piso}
              habitaciones={habitacionesEspeciales.filter(h => String(h.piso_id) === String(pisoSeleccionado))}
            />
          ) : (
            <div className="bg-slate-800 rounded-xl p-12 text-center">
              <p className="text-slate-400">Selecciona un piso para ver su croquis</p>
            </div>
          )}
        </div>
      )}

      {/* Panel HISTORIAL - Monitor de stock */}
      {activeTab === 'historial' && (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">Control de Activos</h2>
            <button 
              onClick={cargarDatos} 
              disabled={sincronizando}
              className={`text-xs px-5 py-2 rounded-xl font-semibold transition-all ${sincronizando ? 'bg-slate-700 text-slate-400 cursor-wait' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-300'}`}
            >
              {sincronizando ? '⌛ SINCRONIZANDO...' : '🔄 SINCRONIZAR'}
            </button>
          </div>
          
          {/* Stock Total Consolidado */}
          <div className="bg-blue-900/10 border border-blue-900/30 rounded-2xl p-6">
            <p className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-4 text-center">
              STOCK TOTAL REAL (Pañol + En Uso + Lavadero)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
              {ITEMS_REQUERIDOS.map(item => (
                <div key={item} className="bg-slate-900/80 p-3 rounded-xl border border-blue-800/40 text-center">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase block">{item}</span>
                  <span className={`text-2xl font-semibold ${totalGlobal[item] < STOCK_CRITICO ? 'text-red-500' : 'text-blue-400'}`}>
                    {totalGlobal[item] || 0}
                  </span>
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-900/20 p-3 rounded-xl border border-green-900/30">
                <p className="text-xs font-semibold text-green-500 uppercase text-center">PAÑOL (Limpio disponible)</p>
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {ITEMS_REQUERIDOS.map(item => {
                    let total = 0;
                    Object.keys(stockPañol).forEach(piso => { total += stockPañol[piso]?.[item] || 0; });
                    return (
                      <div key={item} className="text-center">
                        <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                        <span className={`text-base font-semibold ${total < STOCK_CRITICO ? 'text-red-400' : 'text-green-400'}`}>{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-yellow-900/20 p-3 rounded-xl border border-yellow-900/30">
                <p className="text-xs font-semibold text-yellow-500 uppercase text-center">EN USO</p>
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {ITEMS_REQUERIDOS.map(item => {
                    let total = 0;
                    Object.keys(stockUso).forEach(piso => { total += stockUso[piso]?.[item] || 0; });
                    return (
                      <div key={item} className="text-center">
                        <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                        <span className="text-base font-semibold text-yellow-400">{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-red-900/20 p-3 rounded-xl border border-red-900/30">
                <p className="text-xs font-semibold text-red-500 uppercase text-center">LAVADERO</p>
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {ITEMS_REQUERIDOS.map(item => {
                    let total = 0;
                    Object.keys(stockLavadero).forEach(piso => { total += stockLavadero[piso]?.[item] || 0; });
                    return (
                      <div key={item} className="text-center">
                        <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                        <span className="text-base font-semibold text-red-400">{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Stock por Piso */}
          {Object.keys(stockPañol).map((nombrePiso) => {
            const totalPiso = {};
            ITEMS_REQUERIDOS.forEach(item => {
              totalPiso[item] = (stockPañol[nombrePiso]?.[item] || 0) + (stockUso[nombrePiso]?.[item] || 0) + (stockLavadero[nombrePiso]?.[item] || 0);
            });
            
            return (
              <div key={nombrePiso} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                <div className="bg-slate-800/40 px-6 py-3 border-b border-slate-800 flex justify-between items-center flex-wrap gap-2">
                  <span className="text-xl font-semibold text-blue-400 uppercase tracking-wider">{nombrePiso}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-950/50 border-b border-slate-800">
                  <div className="bg-green-900/20 p-3 rounded-xl">
                    <p className="text-sm font-semibold text-green-500 uppercase text-center">PAÑOL</p>
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {ITEMS_REQUERIDOS.map(item => (
                        <div key={item} className="text-center">
                          <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                          <span className={`text-base font-semibold ${(stockPañol[nombrePiso]?.[item] || 0) < STOCK_CRITICO ? 'text-red-400' : 'text-green-400'}`}>
                            {stockPañol[nombrePiso]?.[item] || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-yellow-900/20 p-3 rounded-xl">
                    <p className="text-sm font-semibold text-yellow-500 uppercase text-center">EN USO</p>
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {ITEMS_REQUERIDOS.map(item => (
                        <div key={item} className="text-center">
                          <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                          <span className="text-sm font-semibold text-yellow-400">{stockUso[nombrePiso]?.[item] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-red-900/20 p-3 rounded-xl">
                    <p className="text-sm font-semibold text-red-500 uppercase text-center">LAVADERO</p>
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {ITEMS_REQUERIDOS.map(item => (
                        <div key={item} className="text-center">
                          <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                          <span className="text-sm font-semibold text-red-400">{stockLavadero[nombrePiso]?.[item] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Historial de movimientos */}
                <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto bg-slate-950/20">
                  {movimientosAgrupados[nombrePiso]?.length > 0 ? (
                    movimientosAgrupados[nombrePiso].map((m) => (
                      <div key={m.id} className="bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800/50 flex items-center gap-2 group hover:bg-slate-800 transition-all text-xs">
                        <div className="w-[22%] shrink-0 flex items-center gap-2">
                          <p className="font-semibold text-white text-[11px] uppercase">{m.item}</p>
                          <p className="text-[10px] text-blue-500 font-semibold">{formatearFechaGuardia(m.created_at)}</p>
                        </div>
                        <div className="flex-1 flex items-center justify-around gap-2">
                          <div className="text-center min-w-[50px]">
                            <span className="text-[9px] text-green-500 font-semibold uppercase block">Lav→Pañol</span>
                            <p className="text-sm font-semibold text-green-500">{m.entregado_limpio > 0 ? `+${m.entregado_limpio}` : '—'}</p>
                          </div>
                          <div className="text-center min-w-[50px]">
                            <span className="text-[9px] text-orange-500 font-semibold uppercase block">Pañol→Uso</span>
                            <p className="text-sm font-semibold text-orange-500">{m.egreso_limpio > 0 ? `-${m.egreso_limpio}` : '—'}</p>
                          </div>
                          <div className="text-center min-w-[50px]">
                            <span className="text-[9px] text-red-500 font-semibold uppercase block">Uso→Lav</span>
                            <p className="text-sm font-semibold text-red-500">{m.retirado_sucio > 0 ? m.retirado_sucio : '—'}</p>
                          </div>
                        </div>
                        <div className="w-[28%] shrink-0 flex items-center justify-end gap-2">
                          {m.novedades && m.novedades !== 'Sin novedades' && m.novedades !== 'Sin novedad' && (
                            <span className="text-[9px] text-yellow-500 font-semibold truncate max-w-[100px]" title={m.novedades}>
                              📝 {m.novedades.length > 12 ? m.novedades.substring(0, 12) + '...' : m.novedades}
                            </span>
                          )}
                          {m.es_cambio_habitacion && <span className="text-[8px] bg-purple-900/50 px-1.5 py-0.5 rounded">HAB</span>}
                          {m.novedades?.includes('Ajuste automático') && <span className="text-[8px] bg-orange-900/50 px-1.5 py-0.5 rounded">⚡</span>}
                          <p className="text-[9px] text-slate-400 font-semibold uppercase truncate">{m.pañolero?.jerarquia} {m.pañolero?.apellido}</p>
                          <button 
                            onClick={() => eliminarMovimiento(m.id)} 
                            className="p-1 bg-red-950/30 text-red-500 rounded border border-red-900/30 hover:bg-red-900/50 transition-all"
                            title="Eliminar movimiento"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-slate-500 text-sm py-6">📭 Sin movimientos registrados en este sector</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel ADMINISTRACIÓN */}
      {activeTab === 'admin' && (
        <div className="space-y-6">
          {/* Auditoría */}
          <section className="bg-slate-900 p-6 rounded-2xl border border-yellow-600/30 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-center sm:text-left">
              <h3 className="text-lg font-semibold uppercase text-yellow-500">🔐 Mando de Auditoría</h3>
              <p className="text-xs text-slate-500 uppercase font-semibold">Ajuste manual de stock habilitado</p>
            </div>
            <button 
              onClick={toggleAuditoria} 
              className={`px-6 py-2.5 rounded-xl font-semibold text-sm uppercase transition-all ${auditoriaHabilitada ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-green-600 text-white hover:bg-green-500'}`}
            >
              {auditoriaHabilitada ? '🔴 Desactivar' : '🟢 Activar'}
            </button>
          </section>

          {/* Gestión de Administradores */}
          <section className="bg-slate-900 p-6 rounded-2xl border border-purple-800/30">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-purple-400 uppercase tracking-wider">
                  👑 Administradores del Sistema
                </h3>
                <p className="text-xs text-slate-500 mt-1">Gestiona los accesos de administradores</p>
              </div>
              <button
                onClick={() => setMostrarModalAdmin(true)}
                className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-xl text-sm font-black uppercase transition-all"
              >
                + Nuevo Admin
              </button>
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {admins.length > 0 ? (
                admins.map(admin => (
                  <div key={admin.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-purple-800/50 transition-all">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-white uppercase">
                            {admin.usuario}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            admin.activo ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                          }`}>
                            {admin.activo ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1 text-[10px] text-slate-500 flex-wrap">
                          <span>🕐 Creado: {new Date(admin.created_at).toLocaleDateString()}</span>
                          {admin.ultimo_acceso && (
                            <span>📱 Último acceso: {new Date(admin.ultimo_acceso).toLocaleString()}</span>
                          )}
                          {admin.intentos_fallidos > 0 && (
                            <span className="text-orange-400">⚠️ Intentos fallidos: {admin.intentos_fallidos}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setAdminSeleccionado(admin);
                            setMostrarModalCambioPin(true);
                          }}
                          className="px-3 py-1.5 bg-yellow-600/20 text-yellow-400 rounded-lg text-xs font-semibold hover:bg-yellow-600 hover:text-white transition-all"
                          title="Cambiar PIN"
                        >
                          🔑 Cambiar PIN
                        </button>
                        <button
                          onClick={() => cambiarEstadoAdmin(admin.id, admin.activo)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            admin.activo 
                              ? 'bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white'
                              : 'bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white'
                          }`}
                        >
                          {admin.activo ? '🔴 Desactivar' : '🟢 Activar'}
                        </button>
                        <button
                          onClick={() => eliminarAdmin(admin.id, admin.usuario)}
                          className="px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg text-xs font-semibold hover:bg-red-600 hover:text-white transition-all"
                          title="Eliminar permanentemente"
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 text-sm py-8">
                  📭 No hay administradores registrados
                </div>
              )}
            </div>
          </section>

          {/* Gestión de Personal */}
          <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-500 uppercase tracking-wider">👥 Tripulación</h3>
                <p className="text-xs text-slate-500 mt-1">Personal operativo del sistema</p>
              </div>
              <button
                onClick={() => setMostrarModalPersonal(true)}
                className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-sm font-black uppercase transition-all"
              >
                + Nuevo Personal
              </button>
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {personal.length > 0 ? (
                personal.map(p => (
                  <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-sm uppercase font-semibold">
                    <span>
                      {p.jerarquia} {p.apellido}, {p.nombre} 
                      <span className="text-blue-500 opacity-50 ml-2 text-[10px]">[{p.rol}]</span>
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => generarQRPersonal(p)}
                        className="bg-green-600/20 text-green-400 text-xs font-semibold uppercase hover:bg-green-600 hover:text-white transition-all px-3 py-1.5 rounded-lg"
                        title="Generar credencial QR"
                      >
                        📱 QR
                      </button>
                      <button 
                        onClick={() => eliminarPersonal(p.dni, `${p.jerarquia} ${p.apellido}`)} 
                        className="bg-red-600/20 text-red-400 text-xs font-semibold uppercase hover:bg-red-600 hover:text-white transition-all px-3 py-1.5 rounded-lg"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 text-sm py-4">📭 No hay personal registrado</div>
              )}
            </div>
          </section>

          {/* Gestión de Pisos y QRs */}
        <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-500 uppercase tracking-wider">🏥 Sectores y QRs</h3>
              <p className="text-xs text-slate-500 mt-1">Pisos, habitaciones y códigos QR</p>
            </div>
            <button
              onClick={() => setMostrarModalPiso(true)}
              className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-sm font-black uppercase transition-all"
            >
              + Nuevo Sector
            </button>
          </div>
          
          <div className="grid grid-cols-1 gap-5">
            {pisos.length > 0 ? (
              pisos.map(p => (
                <div key={p.id} className="bg-slate-950 p-5 rounded-xl border border-slate-800 hover:border-slate-700 transition-all">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                    <span className="text-xl font-semibold text-blue-400 uppercase tracking-wider">{p.nombre_piso}</span>
                    <div className="flex flex-wrap gap-2">
                      {/* QR OCUPACIÓN DEL PISO (NUEVO) */}
                      <button 
                        onClick={() => descargarQR(`/recorrido/${p.slug}`, `RECORRIDO OCUPACIÓN - ${p.nombre_piso}`)} 
                        className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-semibold uppercase text-purple-500 border border-purple-900/30 hover:bg-purple-900/30 transition-all"
                      >
                        🏥 QR Recorrido
                      </button>
                      
                      <button 
                        onClick={() => descargarQR(`/piso/${p.slug}`, `PAÑOL - ${p.nombre_piso}`)} 
                        className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-semibold uppercase text-blue-500 border border-blue-900/30 hover:bg-blue-900/30 transition-all"
                      >
                        🗄️ QR Pañol
                      </button>
                      
                      <button 
                        onClick={() => descargarQR(`/lavadero/${p.slug}`, `LAVADERO - ${p.nombre_piso}`)} 
                        className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-semibold uppercase text-green-500 border border-green-900/30 hover:bg-green-900/30 transition-all"
                      >
                        🧺 QR Lavadero
                      </button>
                      
                      <button 
                        onClick={() => eliminarPiso(p.id, p.nombre_piso)} 
                        className="text-red-500 font-semibold text-xl leading-none px-2 py-1 rounded-lg hover:bg-red-950/30 transition-all"
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                  
                  {/* Habitaciones - Ahora con dos QR por habitación */}
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                      <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                        🏠 Habitaciones ({habitacionesEspeciales.filter(h => h.piso_id === p.id).length})
                      </p>
                      <button 
                        onClick={() => agregarHabitacion(p.id, p.slug)} 
                        className="bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-lg text-xs font-semibold uppercase border border-blue-600/30 hover:bg-blue-600 hover:text-white transition-all"
                      >
                        + Agregar Habitación
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {habitacionesEspeciales.filter(h => h.piso_id === p.id).length > 0 ? (
                        habitacionesEspeciales.filter(h => h.piso_id === p.id).map(hab => {
                          const config = habitacionStatus[hab.id] || { tipo: 'OTROS', camas: '1', texto: '' };
                          const statusBg = config.tipo === 'INTERNACION'
                            ? 'bg-emerald-900/30 border-emerald-600/40'
                            : config.tipo === 'EN REPARACION'
                              ? 'bg-amber-900/30 border-amber-600/40'
                              : 'bg-slate-800/70 border-slate-700';
                          const statusText = config.tipo === 'INTERNACION'
                            ? 'text-emerald-300'
                            : config.tipo === 'EN REPARACION'
                              ? 'text-amber-300'
                              : 'text-slate-300';

                          return (
                            <div key={hab.id} className={`rounded-lg border px-3 py-2 transition-all min-w-[260px] max-w-[320px] w-full sm:w-[320px] ${statusBg}`}>
                              <details
                                className="group"
                                open={!!habitacionesAbiertas[hab.id]}
                                onToggle={(e) => setHabitacionesAbiertas(prev => ({
                                  ...prev,
                                  [hab.id]: e.target.open
                                }))}
                              >
                                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <div className="text-sm font-semibold uppercase tracking-wider text-slate-300">{hab.nombre}</div>
                                      {(config.tipo === 'INTERNACION' || config.tipo === 'OTROS') && (
                                        <button
                                          onClick={(e) => { e.stopPropagation();
                                            if (config.tipo === 'INTERNACION') {
                                              descargarQR(`/ocupacion/${hab.slug}`, `OCUPACIÓN - ${hab.nombre} - ${p.nombre_piso}`);
                                            } else {
                                              descargarQR(`/habitacion/${hab.slug}`, `${hab.nombre} - ${p.nombre_piso} (Ropa blanca)`);
                                            }
                                          }}
                                          className="inline-flex items-center gap-1 bg-slate-800/80 text-slate-200 border border-slate-600/40 px-2 py-1 rounded-xl text-[10px] font-semibold uppercase hover:bg-slate-700 transition-all"
                                          title={config.tipo === 'INTERNACION' ? 'QR Ocupación' : 'QR Ropa limpia'}
                                        >
                                          {config.tipo === 'INTERNACION' ? 'QR OCP' : 'QR ROPA'}
                                        </button>
                                      )}
                                    </div>
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] ${statusText} w-full max-w-[240px] truncate`}>
                                      {truncarTexto(formatearResumenHabitacion(config), 28)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setHabitacionesAbiertas(prev => ({
                                        ...prev,
                                        [hab.id]: !prev[hab.id]
                                      })); }}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-800/80 text-slate-200 border border-slate-600/40 hover:bg-slate-700 transition-all"
                                      title="Ver configuración"
                                    >
                                      ⚙️
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); eliminarHabitacion(hab.id, hab.nombre); }}
                                      className="text-red-500 font-semibold text-base px-2 py-1 rounded hover:bg-red-950/30 transition-all opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
                                      title="Eliminar habitación"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </summary>

                                <div className="mt-3 space-y-3 text-sm">
                                  <div className="grid gap-2 sm:grid-cols-[1.4fr_0.9fr]">
                                    <select
                                      value={config.tipo}
                                      onChange={(e) => actualizarHabitacionStatus(hab.id, 'tipo', e.target.value)}
                                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-slate-500"
                                    >
                                      <option value="INTERNACION">INTERNACIÓN</option>
                                      <option value="EN REPARACION">EN REPARACIÓN</option>
                                      <option value="OTROS">OTROS</option>
                                    </select>
                                    <button
                                      onClick={() => guardarEstadoHabitacion(hab.id)}
                                      className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] hover:bg-slate-600 transition-all"
                                    >
                                      💾 Guardar
                                    </button>
                                  </div>

                                  {config.tipo === 'INTERNACION' && (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <input
                                        type="number"
                                        min="1"
                                        value={config.camas}
                                        onChange={(e) => actualizarHabitacionStatus(hab.id, 'camas', e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="Camas totales"
                                      />
                                      <div className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-300 text-xs uppercase tracking-[0.1em]">
                                        {config.camas_ocupadas ? `Ocupadas: ${config.camas_ocupadas}` : 'Sin ocupación registrada'}
                                      </div>
                                    </div>
                                  )}

                                  {config.tipo === 'OTROS' && (
                                    <input
                                      type="text"
                                      value={config.texto}
                                      onChange={(e) => actualizarHabitacionStatus(hab.id, 'texto', e.target.value)}
                                      placeholder="Oficina, guardia, médico interno..."
                                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-slate-500"
                                    />
                                  )}

                                  <div className="flex flex-wrap gap-2 items-center">
                                    {config.tipo === 'INTERNACION' && (
                                      <button
                                        onClick={() => descargarQR(`/ocupacion/${hab.slug}`, `OCUPACIÓN - ${hab.nombre} - ${p.nombre_piso}`)}
                                        className="inline-flex items-center gap-2 bg-emerald-600/15 text-emerald-300 border border-emerald-500/30 px-3 py-2 rounded-xl text-[10px] font-semibold uppercase hover:bg-emerald-600/20 transition-all"
                                        title="QR para registro de ocupación de pacientes"
                                      >
                                        🏥 QR Ocupación
                                      </button>
                                    )}

                                    {config.tipo === 'OTROS' && (
                                      <button
                                        onClick={() => descargarQR(`/habitacion/${hab.slug}`, `${hab.nombre} - ${p.nombre_piso} (Ropa blanca)`)}
                                        className="inline-flex items-center gap-2 bg-slate-700/70 text-slate-200 border border-slate-500/30 px-3 py-2 rounded-xl text-[10px] font-semibold uppercase hover:bg-slate-700 transition-all"
                                        title="QR para registro de ropa de cama limpia"
                                      >
                                        🧺 QR Ropa limpia
                                      </button>
                                    )}

                                    {config.tipo === 'EN REPARACION' && (
                                      <span className="inline-flex items-center gap-2 bg-amber-600/20 text-amber-200 border border-amber-500/30 px-3 py-2 rounded-xl text-[10px] font-semibold uppercase">
                                        🔧 En reparación
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </details>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-slate-500 italic">No hay habitaciones registradas. Usa el botón "+ Agregar Habitación"</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-slate-500 text-base py-8">📭 No hay sectores registrados. Crea el primer sector usando el botón arriba.</div>
            )}
          </div>
        </section>
        </div>
      )}
      
      {/* Modal para crear nuevo admin */}
      {mostrarModalAdmin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-purple-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-purple-400">Nuevo Administrador</h3>
              <button 
                onClick={() => setMostrarModalAdmin(false)}
                className="text-slate-500 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Usuario
                </label>
                <input
                  type="text"
                  value={nuevoAdmin.usuario}
                  onChange={(e) => setNuevoAdmin({...nuevoAdmin, usuario: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="ej: admin, juan, etc"
                  autoComplete="off"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                  PIN (mínimo 4 dígitos)
                </label>
                <input
                  type="password"
                  value={nuevoAdmin.pin}
                  onChange={(e) => setNuevoAdmin({...nuevoAdmin, pin: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="••••"
                  maxLength="6"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Confirmar PIN
                </label>
                <input
                  type="password"
                  value={nuevoAdmin.confirmarPin}
                  onChange={(e) => setNuevoAdmin({...nuevoAdmin, confirmarPin: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="••••"
                  maxLength="6"
                />
              </div>
              
              <button
                onClick={agregarAdmin}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black py-3 rounded-xl transition-all mt-4"
              >
                Crear Administrador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para cambiar PIN */}
      {mostrarModalCambioPin && adminSeleccionado && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-yellow-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-yellow-400">
                Cambiar PIN - {adminSeleccionado.usuario}
              </h3>
              <button 
                onClick={() => {
                  setMostrarModalCambioPin(false);
                  setNuevoPin('');
                  setConfirmarNuevoPin('');
                }}
                className="text-slate-500 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Nuevo PIN (mínimo 4 dígitos)
                </label>
                <input
                  type="password"
                  value={nuevoPin}
                  onChange={(e) => setNuevoPin(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-yellow-500"
                  placeholder="••••"
                  maxLength="6"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Confirmar nuevo PIN
                </label>
                <input
                  type="password"
                  value={confirmarNuevoPin}
                  onChange={(e) => setConfirmarNuevoPin(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-yellow-500"
                  placeholder="••••"
                  maxLength="6"
                />
              </div>
              
              <button
                onClick={cambiarPinAdmin}
                className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-black py-3 rounded-xl transition-all mt-4"
              >
                Cambiar PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para nuevo personal */}
      {mostrarModalPersonal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-blue-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-blue-400">Nuevo Personal</h3>
              <button 
                onClick={() => setMostrarModalPersonal(false)}
                className="text-slate-500 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <form onSubmit={agregarPersonal} className="space-y-3">
              <input 
                className="w-full bg-slate-800 p-3 rounded-xl border border-slate-700 text-base focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Jerarquía (Ej: Enfermero)" 
                value={nuevoMiembro.jerarquia} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} 
                required 
              />
              <input 
                className="w-full bg-slate-800 p-3 rounded-xl border border-slate-700 text-base focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Nombre" 
                value={nuevoMiembro.nombre} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} 
                required 
              />
              <input 
                className="w-full bg-slate-800 p-3 rounded-xl border border-slate-700 text-base focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Apellido" 
                value={nuevoMiembro.apellido} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} 
                required 
              />
              <input 
                className="w-full bg-slate-800 p-3 rounded-xl border border-slate-700 text-base font-mono focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="DNI" 
                value={nuevoMiembro.dni} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} 
                required 
              />
              <select 
                className="w-full bg-slate-800 p-3 rounded-xl border border-slate-700 text-base font-semibold text-blue-400 uppercase focus:ring-2 focus:ring-blue-500 outline-none" 
                value={nuevoMiembro.rol} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}
              >
                <option value="pañolero">🧺 Pañolero / Operador</option>
                <option value="enfermero">🩺 Encargado de Piso</option>
                <option value="ADMIN">⚙️ Administrador</option>
              </select>
              <button 
                type="submit" 
                className="w-full bg-blue-600 p-3 rounded-xl font-semibold uppercase text-sm hover:bg-blue-500 transition-all"
              >
                Registrar Personal
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal para nuevo piso */}
      {mostrarModalPiso && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-blue-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-blue-400">Nuevo Sector</h3>
              <button 
                onClick={() => setMostrarModalPiso(false)}
                className="text-slate-500 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <form onSubmit={agregarPiso} className="space-y-4">
              <input 
                className="w-full bg-slate-800 p-3 rounded-xl border border-slate-700 text-base focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Nombre del sector (Ej: Piso 1, Terapia, Guardia...)" 
                value={nuevoPiso.nombre_piso} 
                onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} 
                required 
              />
              <button 
                type="submit" 
                className="w-full bg-blue-600 p-3 rounded-xl font-semibold uppercase text-sm hover:bg-blue-500 transition-all"
              >
                Crear Sector
              </button>
            </form>
          </div>
        </div>
      )}
      
      {/* Notificaciones flotantes */}
      {notificacion.visible && (
        <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-5 py-2.5 rounded-xl shadow-2xl font-semibold uppercase text-sm z-[100] border border-blue-400 animate-in slide-in-from-bottom-5">
          {notificacion.mensaje}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;