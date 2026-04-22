// components/VisualizadorDashboard.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import CroquisPiso from './CroquisPiso';
import SpinnerCarga from './SpinnerCarga';
import RecorridosList from './RecorridosList';
import AsistenteIA from './AsistenteIA';

const VisualizadorDashboard = () => {
  const [activeTab, setActiveTab] = useState('croquis');
  const [pisos, setPisos] = useState([]);
  const [habitacionesEspeciales, setHabitacionesEspeciales] = useState([]);
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [stockPañol, setStockPañol] = useState({});
  const [stockUso, setStockUso] = useState({});
  const [stockLavadero, setStockLavadero] = useState({});
  const [cargandoCroquis, setCargandoCroquis] = useState(false);
  const [cargandoMonitor, setCargandoMonitor] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [pisoSeleccionado, setPisoSeleccionado] = useState('');
  const [croquisKey, setCroquisKey] = useState(0);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);
  const [rechazosPacientes, setRechazosPacientes] = useState([]);
  const [rechazosLeidos, setRechazosLeidos] = useState([]);
  const [mostrarModalInfo, setMostrarModalInfo] = useState(false);
  const [cargandoRechazos, setCargandoRechazos] = useState(false);
  const [errorRechazos, setErrorRechazos] = useState('');
  const [rechazosEliminando, setRechazosEliminando] = useState([]);
  const [habitaciones, setHabitaciones] = useState([]);
  const [ocupacion, setOcupacion] = useState({});
  const [activeEstadosTab, setActiveEstadosTab] = useState('internacion');
  const [filterColumn, setFilterColumn] = useState('');

  const ITEMS_REQUERIDOS = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];
  const STORAGE_RECHAZOS_LEIDOS = 'rechazos_pacientes_leidos_visualizador';

  useEffect(() => {
    cargarDatos();
    cargarRechazosPacientes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const intervalo = setInterval(() => {
      cargarRechazosPacientes();
    }, 60000);

    return () => clearInterval(intervalo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recargar datos cuando se cambia a la pestaña monitor y no hay datos
  useEffect(() => {
    if (activeTab === 'monitor' && Object.keys(stockPañol).length === 0 && !cargandoMonitor) {
      cargarDatos();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, stockPañol, cargandoMonitor]);

  const mostrarSplash = (mensaje) => {
    setNotificacion({ visible: true, mensaje });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  const cargarRechazosLeidosStorage = () => {
    try {
      const raw = localStorage.getItem(STORAGE_RECHAZOS_LEIDOS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const guardarRechazosLeidosStorage = (ids) => {
    const normalizados = Array.from(new Set((ids || []).map(id => String(id))));
    localStorage.setItem(STORAGE_RECHAZOS_LEIDOS, JSON.stringify(normalizados));
    setRechazosLeidos(normalizados);
  };

  const extraerDatoMail = (texto, etiquetas = []) => {
    if (!texto) return '';

    for (const etiqueta of etiquetas) {
      const escaped = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escaped}\\s*:\\s*(.*?)(?=\\s*(?:[\\r\\n]|,\\s*[A-ZÁÉÍÓÚÑ. ]+\\s*:|$))`, 'i');
      const match = texto.match(regex);
      if (match?.[1]) return match[1].trim();
    }

    return '';
  };

  const normalizarRechazo = (row) => {
    const cuerpoEmail = row?.cuerpo_email || row?.contenido_email || row?.raw_email || row?.detalle || '';
    const pacienteMail = extraerDatoMail(cuerpoEmail, ['Paciente']);
    const [apellidoMail = '', ...restoNombreMail] = pacienteMail.split(/\s+/).filter(Boolean);
    const nombreMail = restoNombreMail.join(' ');
    const nombre = row?.nombre || row?.paciente_nombre || row?.nombre_paciente || row?.first_name || nombreMail || '';
    const apellido = row?.apellido || row?.paciente_apellido || row?.apellido_paciente || row?.last_name || apellidoMail || '';
    const obraSocial = row?.obra_social || row?.obraSocial || row?.cobertura || row?.financiador || extraerDatoMail(cuerpoEmail, ['OOSS', 'Obra social']) || 'Sin dato';
    const causa = row?.causa_rechazo || row?.causa || row?.motivo || row?.observacion || extraerDatoMail(cuerpoEmail, ['Motivo', 'Causa']) || 'Sin causa registrada';
    const responsableMi = row?.responsable_mi || row?.responsableMi || extraerDatoMail(cuerpoEmail, ['Responsable M.I', 'Responsable MI', 'Responsable']) || 'Sin dato';
    const diagnostico = row?.diagnostico || extraerDatoMail(cuerpoEmail, ['Diagnostico', 'Diagnóstico']) || 'Sin dato';
    
    // Extraer hora de detección del email (formato: "Hora de detección: 14/04/2026 21:19:21")
    const horaDeteccionStr = extraerDatoMail(cuerpoEmail, ['Hora de detección']);
    let horaDeteccion = null;
    
    if (horaDeteccionStr) {
      // Parsear formato "dd/MM/yyyy HH:mm:ss"
      const match = horaDeteccionStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, dia, mes, anio, horas, minutos, segundos] = match;
        horaDeteccion = new Date(`${anio}-${mes}-${dia}T${horas}:${minutos}:${segundos}`);
      }
    }
    
    // Si no se puede extraer la hora, usar created_at como fallback
    const createdAt = horaDeteccion?.toISOString() || row?.created_at || row?.fecha || row?.fecha_rechazo || new Date().toISOString();
    const emailEnviado = Boolean(row?.email_enviado || row?.notificado_email || row?.email_notificado);

    return {
      id: String(row?.id ?? `${nombre}-${apellido}-${createdAt}`),
      nombre,
      apellido,
      obraSocial,
      causa,
      responsableMi,
      diagnostico,
      createdAt,
      emailEnviado,
      cuerpoEmail,
      horaDeteccion,
    };
  };

  const construirClaveRechazo = (item) => [
    (item.apellido || '').toUpperCase().trim(),
    (item.nombre || '').toUpperCase().trim(),
    (item.obraSocial || '').toUpperCase().trim(),
    (item.causa || '').toUpperCase().trim(),
    (item.responsableMi || '').toUpperCase().trim(),
    (item.diagnostico || '').toUpperCase().trim(),
  ].join('|');

  const deduplicarRechazos = (items) => {
    const vistos = new Set();
    return (items || []).filter((item) => {
      const clave = construirClaveRechazo(item);

      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
  };

  const cargarRechazosPacientes = async () => {
    setCargandoRechazos(true);
    setErrorRechazos('');

    try {
      const { data, error } = await supabase
        .from('rechazos_pacientes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const normalizados = deduplicarRechazos((data || []).map(normalizarRechazo));
      setRechazosPacientes(normalizados);
      setRechazosLeidos(cargarRechazosLeidosStorage());
    } catch (error) {
      console.error('Error cargando rechazos de pacientes:', error);
      setErrorRechazos('No se pudieron cargar los rechazos de pacientes.');
      setRechazosPacientes([]);
      setRechazosLeidos(cargarRechazosLeidosStorage());
    } finally {
      setCargandoRechazos(false);
    }
  };

  const abrirModalInfo = () => {
    setMostrarModalInfo(true);
    const idsActuales = rechazosPacientes.map(r => r.id);
    guardarRechazosLeidosStorage([...rechazosLeidos, ...idsActuales]);
  };

  const eliminarRechazoPaciente = async (rechazoId, nombreCompleto) => {
    if (!window.confirm(`¿Eliminar el rechazo de "${nombreCompleto}"?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    try {
      setRechazosEliminando(prev => [...prev, String(rechazoId)]);

      const rechazoActual = rechazosPacientes.find(item => item.id === String(rechazoId));
      const claveObjetivo = rechazoActual ? construirClaveRechazo(rechazoActual) : null;

      let idsAEliminar = [String(rechazoId)];

      if (claveObjetivo) {
        const { data: filasRelacionadas, error: errorConsulta } = await supabase
          .from('rechazos_pacientes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (errorConsulta) throw errorConsulta;

        idsAEliminar = (filasRelacionadas || [])
          .map(normalizarRechazo)
          .filter(item => construirClaveRechazo(item) === claveObjetivo)
          .map(item => item.id);

        if (!idsAEliminar.length) {
          idsAEliminar = [String(rechazoId)];
        }
      }

      const { data: eliminados, error } = await supabase
        .from('rechazos_pacientes')
        .delete()
        .select('id')
        .in('id', idsAEliminar);

      if (error) throw error;
      if (!eliminados || eliminados.length === 0) {
        throw new Error('Sin permisos para eliminar rechazos (RLS/policy)');
      }

      setRechazosPacientes(prev => prev.filter(item => construirClaveRechazo(item) !== claveObjetivo));
      const idsEliminados = eliminados.map(item => String(item.id));
      guardarRechazosLeidosStorage(rechazosLeidos.filter(id => !idsEliminados.includes(id)));
      mostrarSplash('Rechazo eliminado correctamente');
    } catch (error) {
      console.error('Error eliminando rechazo:', error);
      mostrarSplash('❌ Error al eliminar el rechazo');
    } finally {
      setRechazosEliminando(prev => prev.filter(id => id !== String(rechazoId)));
    }
  };

  const cargarDatos = async () => {
    setCargandoCroquis(true);
    setCargandoMonitor(true);
    
    try {
      // Cargar pisos y habitaciones en paralelo
      const [resPisos, resHabs, resOcupacion] = await Promise.all([
        supabase.from('pisos').select('*').order('nombre_piso'),
        supabase.from('habitaciones_especiales').select('*').order('nombre'),
        supabase.from('ocupacion_habitaciones').select('*').order('habitacion_id'),
      ]);
      setPisos(resPisos.data || []);
      setHabitacionesEspeciales(resHabs.data || []);
      // Usar habitaciones_especiales como habitaciones principales
      setHabitaciones(resHabs.data || []);
      setOcupacion(resOcupacion.data?.reduce((acc, curr) => {
        acc[curr.habitacion_id] = curr;
        return acc;
      }, {}) || {});
      
      // Seleccionar automáticamente el piso más alto solo si no hay uno ya seleccionado
      if (resPisos.data && resPisos.data.length > 0) {
        setPisoSeleccionado(prev => {
          if (prev) return prev;
          const pisoMasAlto = resPisos.data.reduce((a, c) => {
            const numA = parseInt(a.nombre_piso.replace(/\D/g, '')) || 0;
            const numC = parseInt(c.nombre_piso.replace(/\D/g, '')) || 0;
            return numC > numA ? c : a;
          });
          return pisoMasAlto.id;
        });
      }
      
      // Cargar movimientos para monitor
      const { data: movs } = await supabase
        .from('movimientos_stock')
        .select(`
          *, 
          pisos(nombre_piso, id), 
          pañolero:personal!movimientos_stock_dni_pañolero_fkey(jerarquia, apellido, nombre), 
          enfermero:personal!movimientos_stock_dni_enfermero_fkey(jerarquia, apellido, nombre)
        `)
        .order('created_at', { ascending: false })
        .limit(500);
      
      // Cargar stocks — una sola consulta para todos los pisos e ítems
      const stockPañolMap = {};
      const stockUsoMap = {};
      const stockLavaderoMap = {};

      if (resPisos.data && resPisos.data.length > 0) {
        const pisoIds = resPisos.data.map(p => p.id);
        const pisoNombrePorId = Object.fromEntries(resPisos.data.map(p => [p.id, p.nombre_piso]));

        const { data: todosLosStocks } = await supabase
          .from('stock_piso')
          .select('piso_id, item, stock_pañol, stock_en_uso, stock_lavadero')
          .in('piso_id', pisoIds)
          .in('item', ITEMS_REQUERIDOS);

        // Inicializar mapas con ceros
        for (const piso of resPisos.data) {
          stockPañolMap[piso.nombre_piso] = {};
          stockUsoMap[piso.nombre_piso] = {};
          stockLavaderoMap[piso.nombre_piso] = {};
          for (const item of ITEMS_REQUERIDOS) {
            stockPañolMap[piso.nombre_piso][item] = 0;
            stockUsoMap[piso.nombre_piso][item] = 0;
            stockLavaderoMap[piso.nombre_piso][item] = 0;
          }
        }

        // Poblar con los datos reales
        for (const row of (todosLosStocks || [])) {
          const nombrePiso = pisoNombrePorId[row.piso_id];
          if (!nombrePiso) continue;
          stockPañolMap[nombrePiso][row.item] = row.stock_pañol || 0;
          stockUsoMap[nombrePiso][row.item] = row.stock_en_uso || 0;
          stockLavaderoMap[nombrePiso][row.item] = row.stock_lavadero || 0;
        }
      }
      
      const agrupados = movs ? movs.reduce((acc, curr) => {
        const nombrePiso = curr.pisos?.nombre_piso || "Sector Desconocido";
        if (!acc[nombrePiso]) acc[nombrePiso] = [];
        acc[nombrePiso].push(curr);
        return acc;
      }, {}) : {};
      
      setMovimientosAgrupados(agrupados);
      setStockPañol(stockPañolMap);
      setStockUso(stockUsoMap);
      setStockLavadero(stockLavaderoMap);
      
      mostrarSplash("Datos actualizados correctamente");
    } catch (error) {
      console.error(error);
      mostrarSplash("Error al sincronizar datos");
    } finally {
      setCargandoCroquis(false);
      setCargandoMonitor(false);
    }
  };

  const calcularTotalGlobal = () => {
    const total = {};
    ITEMS_REQUERIDOS.forEach(item => total[item] = 0);
    Object.keys(stockPañol).forEach(piso => {
      ITEMS_REQUERIDOS.forEach(item => {
        total[item] += (stockPañol[piso]?.[item] || 0) + (stockUso[piso]?.[item] || 0) + (stockLavadero[piso]?.[item] || 0);
      });
    });
    return total;
  };

  const totalGlobal = calcularTotalGlobal();
  const STOCK_CRITICO = 5;

  const formatearFechaGuardia = (fechaISO) => {
    const fecha = new Date(fechaISO);
    const opciones = { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return fecha.toLocaleDateString('es-AR', opciones);
  };

  // Función para refrescar desde cualquier pestaña
  const refrescarDatos = async () => {
    if (activeTab === 'croquis') {
      setCargandoCroquis(true);
      await cargarDatos();
      await cargarRechazosPacientes();
      setCroquisKey(prev => prev + 1);
    } else if (activeTab === 'monitor') {
      await cargarDatos();
      await cargarRechazosPacientes();
    }
  };

  const rechazosNoLeidos = rechazosPacientes.filter(r => !rechazosLeidos.includes(r.id)).length;

  const filtrarHabitacionesPorTipo = (tipo) => {
    return habitaciones.filter(habitacion => {
      const ocu = ocupacion[String(habitacion.id)];
      
      switch (tipo) {
        case 'ocupacion':
          // Solo habitaciones de internación que estén ocupadas
          return ocu && ocu.camas_ocupadas > 0 && ocu.tipo_habitacion === 'activa';
        case 'internacion':
          return ocu && ocu.tipo_habitacion === 'activa';
        case 'reparacion':
          return ocu && ocu.tipo_habitacion === 'reparacion';
        case 'otros':
          return ocu && ocu.tipo_habitacion && ocu.tipo_habitacion !== 'activa' && ocu.tipo_habitacion !== 'reparacion';
        default:
          return false;
      }
    });
  };

  const generarPDFHabitaciones = () => {
    // Importar jsPDF dinámicamente
    import('jspdf').then((jsPDF) => {
      const doc = new jsPDF.default();
      
      // Configuración de página
      doc.setFontSize(16);
      doc.text('Reporte de Estados de Habitaciones', 20, 20);
      
      doc.setFontSize(12);
      const fecha = new Date().toLocaleDateString('es-AR');
      doc.text(`Fecha: ${fecha}`, 20, 30);
      
      // Preparar datos para la tabla según la pestaña activa
      let datosTabla = [];
      let titulo = '';
      let headers = ['PISO', 'HABITACIÓN'];
      
      // Determinar columnas según el tipo de pestaña
      if (activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') {
        headers.push('CAMAS OCUPADAS', 'CAPACIDAD CAMAS', 'AISLACIÓN');
      }
      headers.push('NOVEDADES');
      
      switch(activeEstadosTab) {
        case 'internacion':
          titulo = 'Habitaciones de Internación';
          datosTabla = filtrarHabitacionesPorTipo('internacion').map(habitacion => {
            const ocu = ocupacion[habitacion.id];
            const piso = pisos.find(p => String(p.id) === String(habitacion.piso_id));
            
            return [
              piso?.nombre_piso || 'Sin piso',
              habitacion.nombre || 'Sin nombre',
              ocu ? String(ocu.camas_ocupadas || 0) : '0',
              ocu ? String(ocu.total_camas || 0) : '0',
              ocu?.observaciones?.includes('AISLAMIENTO') ? 'SI' : 'NO',
              ocu?.informacion_ampliatoria || 'Sin novedades'
            ];
          });
          break;
        case 'reparacion':
          titulo = 'Habitaciones en Reparación';
          datosTabla = filtrarHabitacionesPorTipo('reparacion').map(habitacion => {
            const ocu = ocupacion[habitacion.id];
            const piso = pisos.find(p => String(p.id) === String(habitacion.piso_id));
            
            return [
              piso?.nombre_piso || 'Sin piso',
              habitacion.nombre || 'Sin nombre',
              ocu?.informacion_ampliatoria || 'Sin novedades'
            ];
          });
          break;
        case 'otros':
          titulo = 'Habitaciones Otras';
          datosTabla = filtrarHabitacionesPorTipo('otros').map(habitacion => {
            const ocu = ocupacion[habitacion.id];
            const piso = pisos.find(p => String(p.id) === String(habitacion.piso_id));
            
            return [
              piso?.nombre_piso || 'Sin piso',
              habitacion.nombre || 'Sin nombre',
              ocu?.informacion_ampliatoria || 'Sin novedades'
            ];
          });
          break;
        case 'ocupacion':
          titulo = 'Habitaciones Ocupadas';
          datosTabla = filtrarHabitacionesPorTipo('ocupacion').map(habitacion => {
            const ocu = ocupacion[habitacion.id];
            const piso = pisos.find(p => String(p.id) === String(habitacion.piso_id));
            
            return [
              piso?.nombre_piso || 'Sin piso',
              habitacion.nombre || 'Sin nombre',
              ocu ? String(ocu.camas_ocupadas || 0) : '0',
              ocu ? String(ocu.total_camas || 0) : '0',
              ocu?.observaciones?.includes('AISLAMIENTO') ? 'SI' : 'NO',
              ocu?.informacion_ampliatoria || 'Sin novedades'
            ];
          });
          break;
        default:
          titulo = 'Habitaciones';
          datosTabla = [];
          break;
      }
      
      doc.text(titulo, 20, 40);
      
      // Agregar tabla
      doc.autoTable({
        head: headers,
        body: datosTabla,
        startY: 50,
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: 255
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 30 },
          2: { cellWidth: 30 },
          3: { cellWidth: 35 },
          4: { cellWidth: 25 },
          5: { cellWidth: 45 }
        }
      });
      
      // Guardar PDF
      doc.save(`estados_habitaciones_${new Date().toISOString().split('T')[0]}.pdf`);
    }).catch(err => {
      console.error('Error al generar PDF:', err);
      mostrarSplash('Error al generar PDF');
    });
  };

  useEffect(() => {
    const actualizarBadgePwa = async () => {
      try {
        if (rechazosNoLeidos > 0 && 'setAppBadge' in navigator) {
          await navigator.setAppBadge(rechazosNoLeidos);
          return;
        }

        if ('clearAppBadge' in navigator) {
          await navigator.clearAppBadge();
        }
      } catch {
        // Algunos navegadores/plataformas no soportan el badge o lo restringen.
      }
    };

    actualizarBadgePwa();
  }, [rechazosNoLeidos]);

  return (
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full">
        <button 
          onClick={() => setActiveTab('croquis')} 
          className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeTab === 'croquis' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Hotelería
        </button>
        <button 
          onClick={() => setActiveTab('estados')} 
          className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeTab === 'estados' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Estados
        </button>
        <button 
          onClick={() => setActiveTab('recorridos')} 
          className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeTab === 'recorridos' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Recorridos
        </button>
        <button 
          onClick={() => setActiveTab('monitor')} 
          className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeTab === 'monitor' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Monitor
        </button>
      </div>

      {/* Panel CROQUIS */}
      {activeTab === 'croquis' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <h2 className="text-lg sm:text-2xl font-semibold text-white uppercase tracking-tighter">
              MAPA DE SECTORES
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={abrirModalInfo}
                className="relative bg-red-600 hover:bg-red-500 text-white transition-colors text-sm flex items-center gap-1 px-3 py-2 rounded-xl"
                title="Rechazos de pacientes"
              >
                <span className="font-semibold">Info</span>
                {rechazosNoLeidos > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-white text-red-700 text-[10px] font-black flex items-center justify-center border border-red-600">
                    {rechazosNoLeidos > 99 ? '99+' : rechazosNoLeidos}
                  </span>
                )}
              </button>
              <select
                value={pisoSeleccionado}
                onChange={(e) => {
                  setPisoSeleccionado(e.target.value);
                  setCroquisKey(prev => prev + 1);
                }}
                className="flex-1 min-w-[120px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value="">Seleccionar ...</option>
                {pisos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre_piso}</option>
                ))}
              </select>
              <input 
                type="date" 
                value={fechaSeleccionada}
                onChange={(e) => { setFechaSeleccionada(e.target.value); setCroquisKey(prev => prev + 1); }}
                className="flex-1 min-w-[130px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
              <button 
                onClick={refrescarDatos}
                disabled={cargandoCroquis}
                className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1 px-3 py-2 rounded-xl hover:bg-slate-800"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {cargandoCroquis ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>
          </div>
          
          {cargandoCroquis ? (
            <SpinnerCarga mensaje="CARGANDO HABITACIONES..." />
          ) : pisoSeleccionado ? (
            <CroquisPiso
              key={croquisKey}
              pisoId={pisoSeleccionado}
              pisoNombre={pisos.find(p => String(p.id) === String(pisoSeleccionado))?.nombre_piso}
              habitaciones={habitacionesEspeciales.filter(h => String(h.piso_id) === String(pisoSeleccionado))}
              esVisualizador={true}
              fechaConsulta={fechaSeleccionada}
            />
          ) : (
            <div className="bg-slate-800 rounded-xl p-12 text-center">
              <p className="text-slate-400">Selecciona un piso para ver su plano</p>
            </div>
          )}
        </div>
      )}

      {/* Panel ESTADOS */}
      {activeTab === 'estados' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">
              ESTADOS DE HABITACIONES
            </h2>
            <button
              onClick={generarPDFHabitaciones}
              className="bg-blue-600 hover:bg-blue-500 text-white transition-colors text-sm flex items-center gap-2 px-4 py-2 rounded-xl"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Descargar PDF
            </button>
          </div>

          {/* Sub-tabs inside ESTADOS */}
          <div className="flex gap-1 mb-6 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full">
            <button 
              onClick={() => setActiveEstadosTab('internacion')} 
              className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeEstadosTab === 'internacion' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Internación
            </button>
            <button 
              onClick={() => setActiveEstadosTab('reparacion')} 
              className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeEstadosTab === 'reparacion' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Reparación
            </button>
            <button 
              onClick={() => setActiveEstadosTab('otros')} 
              className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeEstadosTab === 'otros' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Otras
            </button>
            <button 
              onClick={() => setActiveEstadosTab('ocupacion')} 
              className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeEstadosTab === 'ocupacion' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Ocupación
            </button>
          </div>

          {/* Resúmenes totales entre botones y tabla */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              {activeEstadosTab === 'internacion' && (
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Internación</div>
                  <div className="text-2xl font-bold text-green-400">
                    {filtrarHabitacionesPorTipo('internacion').length}
                  </div>
                  <div className="text-xs text-slate-500">Total de habitaciones</div>
                </div>
              )}
              
              {activeEstadosTab === 'reparacion' && (
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Reparación</div>
                  <div className="text-2xl font-bold text-orange-400">
                    {filtrarHabitacionesPorTipo('reparacion').length}
                  </div>
                  <div className="text-xs text-slate-500">Total de habitaciones en reparación</div>
                </div>
              )}
              
              {activeEstadosTab === 'otros' && (
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Otros fines</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {filtrarHabitacionesPorTipo('otros').length}
                  </div>
                  <div className="text-xs text-slate-500">Total de habitaciones para otros fines</div>
                </div>
              )}
              
              {activeEstadosTab === 'ocupacion' && (
                <>
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Habitaciones ocupadas</div>
                    <div className="text-2xl font-bold text-blue-400">
                      {filtrarHabitacionesPorTipo('ocupacion').length}
                    </div>
                    <div className="text-xs text-slate-500">Total de habitaciones ocupadas</div>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Camas ocupadas</div>
                    <div className="text-2xl font-bold text-blue-400">
                      {filtrarHabitacionesPorTipo('ocupacion').reduce((total, hab) => {
                        const ocu = ocupacion[hab.id];
                        return total + (ocu?.camas_ocupadas || 0);
                      }, 0)}
                    </div>
                    <div className="text-xs text-slate-500">Total de camas ocupadas</div>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Camas bloqueadas por patologías</div>
                    <div className="text-2xl font-bold text-red-400">
                      {filtrarHabitacionesPorTipo('ocupacion').reduce((total, hab) => {
                        const ocu = ocupacion[hab.id];
                        return total + (ocu?.observaciones?.includes('AISLAMIENTO') ? (ocu?.camas_ocupadas || 0) : 0);
                      }, 0)}
                    </div>
                    <div className="text-xs text-slate-500">Total de camas bloqueadas por patologías</div>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Camas disponibles</div>
                    <div className="text-2xl font-bold text-green-400">
                      {filtrarHabitacionesPorTipo('ocupacion').reduce((total, hab) => {
                        const ocu = ocupacion[hab.id];
                        return total + ((ocu?.total_camas || 0) - (ocu?.camas_ocupadas || 0));
                      }, 0)}
                    </div>
                    <div className="text-xs text-slate-500">Total de camas disponibles</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Table content based on active sub-tab */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                      PISO
                      {(activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') && (
                        <div className="mt-1">
                          <input
                            type="text"
                            placeholder="Filtrar piso..."
                            value={filterColumn === 'piso' ? filterColumn : ''}
                            onChange={(e) => setFilterColumn(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white w-full"
                            onFocus={() => setFilterColumn('piso')}
                          />
                        </div>
                      )}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                      HABITACIÓN
                      {(activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') && (
                        <div className="mt-1">
                          <input
                            type="text"
                            placeholder="Filtrar habitación..."
                            value={filterColumn === 'habitacion' ? filterColumn : ''}
                            onChange={(e) => setFilterColumn(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white w-full"
                            onFocus={() => setFilterColumn('habitacion')}
                          />
                        </div>
                      )}
                    </th>
                    {(activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                        CAMAS OCUPADAS
                        <div className="mt-1">
                          <input
                            type="text"
                            placeholder="Filtrar..."
                            value={filterColumn === 'camas_ocupadas' ? filterColumn : ''}
                            onChange={(e) => setFilterColumn(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white w-full"
                            onFocus={() => setFilterColumn('camas_ocupadas')}
                          />
                        </div>
                      </th>
                    )}
                    {(activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                        CAPACIDAD CAMAS
                        <div className="mt-1">
                          <input
                            type="text"
                            placeholder="Filtrar..."
                            value={filterColumn === 'total_camas' ? filterColumn : ''}
                            onChange={(e) => setFilterColumn(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white w-full"
                            onFocus={() => setFilterColumn('total_camas')}
                          />
                        </div>
                      </th>
                    )}
                    {(activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                        AISLACIÓN
                        <div className="mt-1">
                          <select
                            value={filterColumn === 'aislacion' ? filterColumn : ''}
                            onChange={(e) => setFilterColumn(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white w-full"
                            onFocus={() => setFilterColumn('aislacion')}
                          >
                            <option value="">Todos</option>
                            <option value="SI">SI</option>
                            <option value="NO">NO</option>
                          </select>
                        </div>
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                      NOVEDADES
                      {(activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') && (
                        <div className="mt-1">
                          <input
                            type="text"
                            placeholder="Filtrar..."
                            value={filterColumn === 'novedades' ? filterColumn : ''}
                            onChange={(e) => setFilterColumn(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white w-full"
                            onFocus={() => setFilterColumn('novedades')}
                          />
                        </div>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtrarHabitacionesPorTipo(activeEstadosTab).map(habitacion => {
                    const ocu = ocupacion[String(habitacion.id)];
                    const piso = pisos.find(p => String(p.id) === String(habitacion.piso_id));
                    
                    return (
                      <tr key={habitacion.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-slate-200">{piso?.nombre_piso || 'Sin piso'}</td>
                        <td className="px-4 py-3 text-slate-200">{habitacion.nombre || 'Sin nombre'}</td>
                        {(activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') && (
                          <td className="px-4 py-3 text-slate-200">{ocu ? String(ocu.camas_ocupadas || 0) : '0'}</td>
                        )}
                        {(activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') && (
                          <td className="px-4 py-3 text-slate-200">{ocu ? String(ocu.total_camas || 0) : '0'}</td>
                        )}
                        {(activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion') && (
                          <td className="px-4 py-3 text-slate-200">
                            {ocu?.observaciones?.includes('AISLAMIENTO') ? (
                              <span className="text-red-400 font-semibold">SI</span>
                            ) : (
                              <span className="text-green-400">NO</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-200 max-w-xs truncate" title={ocu?.informacion_ampliatoria || 'Sin novedades'}>
                          {(activeEstadosTab === 'internacion' || activeEstadosTab === 'otros' || activeEstadosTab === 'ocupacion') ? (ocu?.informacion_ampliatoria || 'Sin novedades') : 'Sin novedad'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {filtrarHabitacionesPorTipo(activeEstadosTab).length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  No hay habitaciones para mostrar en esta categoría
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panel RECORRIDOS */}
      {activeTab === 'recorridos' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">
              REGISTRO DE RECORRIDOS
            </h2>
            <p className="text-xs text-slate-500">
              Historial de recorridos de ocupación
            </p>
          </div>
          <RecorridosList esVisualizador={true} />
        </div>
      )}

      {/* Panel MONITOR - Solo lectura */}
      {activeTab === 'monitor' && (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">Monitor de Stock</h2>
            {/* Botón actualizar estilo RECORRIDOS */}
            <button 
              onClick={refrescarDatos}
              disabled={cargandoMonitor}
              className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {cargandoMonitor ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
          
          {cargandoMonitor ? (
            <SpinnerCarga mensaje="CARGANDO MOVIMIENTOS..." />
          ) : (
            <>
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
              </div>

              {/* Stock por Piso */}
              {Object.keys(stockPañol).map((nombrePiso) => (
                <div key={nombrePiso} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                  <div className="bg-slate-800/40 px-6 py-3 border-b border-slate-800">
                    <span className="text-xl font-semibold text-green-400 uppercase tracking-wider">{nombrePiso}</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-950/50 border-b border-slate-800">
                    <div className="bg-green-900/20 p-3 rounded-xl">
                      <p className="text-sm font-semibold text-green-500 uppercase text-center">PAÑOL</p>
                      <div className="grid grid-cols-4 gap-1 mt-2">
                        {ITEMS_REQUERIDOS.map(item => (
                          <div key={item} className="text-center">
                            <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                            <span className="text-base font-semibold text-green-400">
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
                  
                  {/* Historial de movimientos - Solo lectura, sin botón eliminar */}
                  <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto bg-slate-950/20">
                    {movimientosAgrupados[nombrePiso]?.length > 0 ? (
                      movimientosAgrupados[nombrePiso].map((m) => (
                        <div key={m.id} className="bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800/50 flex items-center gap-2 text-xs">
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
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-slate-500 text-sm py-6">📭 Sin movimientos registrados en este sector</div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {mostrarModalInfo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl p-5 max-w-3xl w-full border border-red-800 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-red-400 uppercase tracking-wide">Info de Rechazos</h3>
                <p className="text-xs text-slate-400">Notificaciones de rechazos de pacientes y estado de aviso por email</p>
              </div>
              <button
                onClick={() => setMostrarModalInfo(false)}
                className="text-slate-400 hover:text-white text-2xl leading-none"
                title="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase font-semibold text-slate-400">Total: {rechazosPacientes.length}</span>
              <span className="text-xs uppercase font-semibold text-red-400">No leídos: {rechazosNoLeidos}</span>
              <button
                onClick={() => guardarRechazosLeidosStorage(rechazosPacientes.map(r => r.id))}
                className="ml-auto bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700"
              >
                Marcar todos como leídos
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {cargandoRechazos && (
                <div className="text-center text-slate-400 text-sm py-8">Cargando rechazos...</div>
              )}

              {!cargandoRechazos && errorRechazos && (
                <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-4 text-sm text-red-300">
                  {errorRechazos}
                </div>
              )}

              {!cargandoRechazos && !errorRechazos && rechazosPacientes.length === 0 && (
                <div className="text-center text-slate-500 text-sm py-8">Sin rechazos registrados.</div>
              )}

              {!cargandoRechazos && !errorRechazos && rechazosPacientes.map((rechazo) => {
                const noLeido = !rechazosLeidos.includes(rechazo.id);
                const eliminando = rechazosEliminando.includes(rechazo.id);
                const nombreCompleto = `${rechazo.apellido || 'Sin apellido'}, ${rechazo.nombre || 'Sin nombre'}`;

                return (
                  <div key={rechazo.id} className={`rounded-xl border p-3 ${noLeido ? 'border-red-700 bg-red-950/20' : 'border-slate-800 bg-slate-950/40'}`}>
                    <div className="flex justify-between gap-2 items-start">
                      <div>
                        <p className="text-sm font-semibold text-white uppercase">
                          {nombreCompleto}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {rechazo.horaDeteccion ? 
                            `Hora de detección: ${rechazo.horaDeteccion.toLocaleTimeString('es-AR', { 
                              hour12: false,
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}` :
                            new Date(rechazo.createdAt).toLocaleString('es-AR', { 
                              hour12: false,
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })
                          }
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        {noLeido ? (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-600/20 text-red-300 border border-red-600/40">No leído</span>
                        ) : (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300 border border-emerald-600/40">Leído</span>
                        )}
                        <button
                          type="button"
                          onClick={() => eliminarRechazoPaciente(rechazo.id, nombreCompleto)}
                          disabled={eliminando}
                          className="bg-red-950/60 hover:bg-red-900/70 disabled:opacity-60 disabled:cursor-not-allowed text-red-200 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border border-red-800"
                        >
                          {eliminando ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-900/70 rounded-lg px-2.5 py-2 border border-slate-800">
                        <p className="text-slate-500 uppercase font-semibold">Obra social</p>
                        <p className="text-slate-200 font-semibold mt-0.5">{rechazo.obraSocial || 'Sin dato'}</p>
                      </div>
                      <div className="bg-slate-900/70 rounded-lg px-2.5 py-2 border border-slate-800">
                        <p className="text-slate-500 uppercase font-semibold">Email</p>
                        <p className={`font-semibold mt-0.5 ${rechazo.emailEnviado ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {rechazo.emailEnviado ? 'Enviado' : 'Pendiente / Sin confirmar'}
                        </p>
                      </div>
                      <div className="bg-slate-900/70 rounded-lg px-2.5 py-2 border border-slate-800">
                        <p className="text-slate-500 uppercase font-semibold">Responsable M.I.</p>
                        <p className="text-slate-200 font-semibold mt-0.5">{rechazo.responsableMi || 'Sin dato'}</p>
                      </div>
                      <div className="bg-slate-900/70 rounded-lg px-2.5 py-2 border border-slate-800">
                        <p className="text-slate-500 uppercase font-semibold">Diagnóstico</p>
                        <p className="text-slate-200 font-semibold mt-0.5">{rechazo.diagnostico || 'Sin dato'}</p>
                      </div>
                    </div>

                    <div className="mt-2 bg-slate-900/70 rounded-lg px-2.5 py-2 border border-slate-800">
                      <p className="text-slate-500 uppercase font-semibold text-xs">Causa del rechazo</p>
                      <p className="text-slate-200 text-sm mt-0.5">{rechazo.causa}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <AsistenteIA pisos={pisos} />

      {/* Notificación flotante */}
      {notificacion.visible && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none">
          <div className="bg-slate-800 text-slate-200 px-6 py-4 rounded-lg shadow-xl font-medium text-sm border border-slate-600">
            {notificacion.mensaje}
          </div>
        </div>
      )}
    </div>
  );
};

export default VisualizadorDashboard;
