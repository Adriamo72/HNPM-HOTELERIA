// components/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import bcrypt from 'bcryptjs';
import CroquisPiso from './CroquisPiso';
import SpinnerCarga from './SpinnerCarga';
import RecorridosList from './RecorridosList';
import AsistenteIA from './AsistenteIA';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('croquis');
  const [activeEstadosTab, setActiveEstadosTab] = useState('internacion');
  const [filterColumn, setFilterColumn] = useState('');
  const [habitaciones, setHabitaciones] = useState([]);
  const [ocupacion, setOcupacion] = useState({});
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [habitacionesEspeciales, setHabitacionesEspeciales] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [stockPañol, setStockPañol] = useState({});
  const [stockUso, setStockUso] = useState({});
  const [stockLavadero, setStockLavadero] = useState({});
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [cargandoCroquis, setCargandoCroquis] = useState(false);
  const [cargandoMonitor, setCargandoMonitor] = useState(false);
  const [cargandoAdmin, setCargandoAdmin] = useState(false);
  const [visualizadores, setVisualizadores] = useState([]);
  const [mostrarModalVisualizador, setMostrarModalVisualizador] = useState(false);
  const [nuevoVisualizador, setNuevoVisualizador] = useState({ usuario: '', pin: '', confirmarPin: '' });
  const [visualizadorSeleccionado, setVisualizadorSeleccionado] = useState(null);
  const [mostrarModalCambioPinVisualizador, setMostrarModalCambioPinVisualizador] = useState(false);
  const [rechazosPacientes, setRechazosPacientes] = useState([]);
  const [rechazosLeidos, setRechazosLeidos] = useState([]);
  const [mostrarModalInfo, setMostrarModalInfo] = useState(false);
  const [cargandoRechazos, setCargandoRechazos] = useState(false);
  const [errorRechazos, setErrorRechazos] = useState('');
  const [rechazosEliminando, setRechazosEliminando] = useState([]);

  
  // Estados para modales
  const [mostrarModalAdmin, setMostrarModalAdmin] = useState(false);
  const [mostrarModalCambioPin, setMostrarModalCambioPin] = useState(false);
  const [mostrarModalPersonal, setMostrarModalPersonal] = useState(false);
  const [mostrarModalPiso, setMostrarModalPiso] = useState(false);
  const [adminSeleccionado, setAdminSeleccionado] = useState(null);
  
  // Estados para formularios
  const [nuevoAdmin, setNuevoAdmin] = useState({ usuario: '', pin: '', confirmarPin: '' });
  const [nuevoPin, setNuevoPin] = useState('');
  const [confirmarNuevoPin, setConfirmarNuevoPin] = useState('');
  const [nuevoMiembro, setNuevoMiembro] = useState({ 
    dni: '', 
    nombre: '', 
    apellido: '', 
    jerarquia: '', 
    celular: '', 
    rol: 'pañolero' 
  });
  const [nuevoPiso, setNuevoPiso] = useState({ nombre_piso: '' });
  const [pisoSeleccionado, setPisoSeleccionado] = useState('');
  const [habitacionStatus, setHabitacionStatus] = useState({});
  const [habitacionesAbiertas, setHabitacionesAbiertas] = useState({});
  const TIPO_MAP_DB = { INTERNACION: 'activa', 'EN REPARACION': 'reparacion', OTROS: 'otros' };
  const TIPO_MAP_UI = { activa: 'INTERNACION', reparacion: 'EN REPARACION', otros: 'OTROS' };
  const ITEMS_REQUERIDOS = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];
  const STORAGE_RECHAZOS_LEIDOS = 'rechazos_pacientes_leidos_admin';
  const ROLE_LABELS_TRIPULACION = {
    pañolero: 'PAÑOLERO',
    operador: 'OPERADOR',
    encargado_piso: 'ENCARGADO DE PISO',
    enfermero: 'ENCARGADO DE PISO',
  };

  const formatearResumenHabitacion = (config) => {
  if (config.tipo === 'INTERNACION') {
    const camas = Number(config.camas) || 0;
    const info = config.informacion_ampliatoria ? ` · ${config.informacion_ampliatoria}` : '';
    if (camas === 0) {
      return `INTERNACIÓN (SIN CAMAS${info})`;
    }
    return `INTERNACIÓN (${camas} cama${camas === 1 ? '' : 's'}${info})`;
  }

  if (config.tipo === 'EN REPARACION') {
    return '🔧 EN REPARACIÓN';
  }

  const texto = config.texto ? config.texto.trim() : '';
  return `📌 OTROS (${texto})`;
};

  const truncarTexto = (texto, largo = 28) => {
    if (!texto) return texto;
    return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;
  };

  const STOCK_CRITICO = 5;
  const [croquisKey, setCroquisKey] = useState(0);

  // ==================== CARGAR DATOS PRINCIPAL ====================
  const cargarDatos = async (tipo = 'todos') => {
    if (tipo === 'croquis' || tipo === 'todos') setCargandoCroquis(true);
    if (tipo === 'monitor' || tipo === 'todos') setCargandoMonitor(true);
    if (tipo === 'admin' || tipo === 'todos') setCargandoAdmin(true);
      try {
        if (tipo === 'croquis' || tipo === 'todos') {
          const [resPisos, resHabs, resPers] = await Promise.all([
            supabase.from('pisos').select('*').order('nombre_piso'),
            supabase.from('habitaciones_especiales').select('*').order('nombre'),
            supabase.from('personal').select('*').order('apellido'),
          ]);
          setPisos(resPisos.data || []);
          setPersonal(resPers.data || []);
          // Usar habitaciones_especiales como habitaciones principales
          setHabitacionesEspeciales(resHabs.data || []);
          setHabitaciones(resHabs.data || []);
          await cargarEstadoHabitaciones(resHabs.data || []);
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
          await cargarEstadoHabitaciones(resHabs.data || []);
        }

        if (tipo === 'monitor' || tipo === 'todos') {
          const resPisosMonitor = await supabase.from('pisos').select('*').order('nombre_piso');
          const pisosMonitor = resPisosMonitor.data || [];

          const pisoIds = pisosMonitor.map(p => p.id);
          const pisoNombrePorId = Object.fromEntries(pisosMonitor.map(p => [p.id, p.nombre_piso]));

          const [{ data: movs }, { data: todosLosStocks }] = await Promise.all([
            supabase
              .from('movimientos_stock')
              .select('*, pisos(nombre_piso, id), pañolero:personal!movimientos_stock_dni_pañolero_fkey(jerarquia, apellido, nombre), enfermero:personal!movimientos_stock_dni_enfermero_fkey(jerarquia, apellido, nombre)')
              .order('created_at', { ascending: false })
              .limit(500),
            pisoIds.length > 0
              ? supabase.from('stock_piso').select('piso_id, item, stock_pañol, stock_en_uso, stock_lavadero').in('piso_id', pisoIds).in('item', ITEMS_REQUERIDOS)
              : Promise.resolve({ data: [] }),
          ]);

          const stockPañolMap = {};
          const stockUsoMap = {};
          const stockLavaderoMap = {};

          for (const piso of pisosMonitor) {
            stockPañolMap[piso.nombre_piso] = {};
            stockUsoMap[piso.nombre_piso] = {};
            stockLavaderoMap[piso.nombre_piso] = {};
            for (const item of ITEMS_REQUERIDOS) {
              stockPañolMap[piso.nombre_piso][item] = 0;
              stockUsoMap[piso.nombre_piso][item] = 0;
              stockLavaderoMap[piso.nombre_piso][item] = 0;
            }
          }

          for (const row of (todosLosStocks || [])) {
            const nombrePiso = pisoNombrePorId[row.piso_id];
            if (!nombrePiso) continue;
            stockPañolMap[nombrePiso][row.item] = row.stock_pañol || 0;
            stockUsoMap[nombrePiso][row.item] = row.stock_en_uso || 0;
            stockLavaderoMap[nombrePiso][row.item] = row.stock_lavadero || 0;
          }

          const agrupados = movs ? movs.reduce((acc, curr) => {
            const nombrePiso = curr.pisos?.nombre_piso || 'Sector Desconocido';
            if (!acc[nombrePiso]) acc[nombrePiso] = [];
            acc[nombrePiso].push(curr);
            return acc;
          }, {}) : {};

          setMovimientosAgrupados(agrupados);
          setStockPañol(stockPañolMap);
          setStockUso(stockUsoMap);
          setStockLavadero(stockLavaderoMap);
        }
      } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarSplash('Error al cargar datos');
      } finally {
        if (tipo === 'croquis' || tipo === 'todos') setCargandoCroquis(false);
        if (tipo === 'monitor' || tipo === 'todos') setCargandoMonitor(false);
        if (tipo === 'admin' || tipo === 'todos') setCargandoAdmin(false);
      }
  };

  useEffect(() => {
    cargarDatos('todos');
    cargarAdmins();
    cargarVisualizadores();
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

  // Recargar datos cuando se cambia a la pestaña historial y no hay datos
  useEffect(() => {
    if (activeTab === 'historial' && Object.keys(stockPañol).length === 0 && !cargandoMonitor) {
      cargarDatos('monitor');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, stockPañol, cargandoMonitor]);

  useEffect(() => {
    if (!habitacionesEspeciales.length) return;
    setHabitacionStatus(prev => {
      const next = { ...prev };
      habitacionesEspeciales.forEach(hab => {
        if (!next[hab.id]) {
          next[hab.id] = { tipo: 'OTROS', camas: '1', texto: '' };
        }
      });
      return next;
    });
  }, [habitacionesEspeciales]);

  const actualizarHabitacionStatus = (habId, field, value) => {
    setHabitacionStatus(prev => ({
      ...prev,
      [habId]: {
        ...prev[habId],
        [field]: value
      }
    }));
  };

  const cargarEstadoHabitaciones = async (habitaciones = []) => {
  if (!habitaciones.length) return;

  try {
    const { data, error } = await supabase
      .from('ocupacion_habitaciones')
      .select('*')
      .in('habitacion_id', habitaciones.map(h => h.id))
      .order('actualizado_en', { ascending: false })
      .order('fecha', { ascending: false });

    if (error) throw error;

    const estadoPorHabitacion = {};
    (data || []).forEach(e => {
      if (!estadoPorHabitacion[e.habitacion_id]) {
        estadoPorHabitacion[e.habitacion_id] = e;
      }
    });

    // Actualizar habitacionStatus para la funcionalidad existente
    const next = {};
    habitaciones.forEach(hab => {
      const estado = estadoPorHabitacion[hab.id];
      next[hab.id] = {
        tipo: estado ? TIPO_MAP_UI[estado.tipo_habitacion] || 'OTROS' : 'OTROS',
        camas: estado?.total_camas?.toString() || '0',
        texto: estado?.observaciones || '',
        camas_ocupadas: estado?.camas_ocupadas || 0,
        informacion_ampliatoria: estado?.informacion_ampliatoria || ''  // NUEVO CAMPO
      };
    });
    setHabitacionStatus(prev => ({
      ...prev,
      ...next
    }));

    // Actualizar ocupacion para la funcionalidad ESTADOS
    const ocupacionMap = {};
    (data || []).forEach(e => {
      if (!ocupacionMap[String(e.habitacion_id)]) {
        ocupacionMap[String(e.habitacion_id)] = e;
      }
    });
    setOcupacion(ocupacionMap);
  } catch (error) {
    console.error('Error cargando estado de habitaciones:', error);
  }
};

  const guardarEstadoHabitacion = async (habId) => {
  const config = habitacionStatus[habId];
  if (!config) return;

  const fecha = new Date().toISOString().split('T')[0];

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('ocupacion_habitaciones')
      .select('id')
      .eq('habitacion_id', habId)
      .eq('fecha', fecha)
      .maybeSingle();
    if (fetchError) throw fetchError;

    let totalCamas = 1;
    let camasOcupadas = 0;
    let observaciones = null;
    let informacionAmpliatoria = null;
    
    if (config.tipo === 'INTERNACION') {
      totalCamas = Number(config.camas) || 0;
      camasOcupadas = Number(config.camas_ocupadas) || 0;
      observaciones = null;
      informacionAmpliatoria = config.informacion_ampliatoria;  // MANTENER VALOR EXISTENTE
    } else if (config.tipo === 'EN REPARACION') {
      totalCamas = 1;
      camasOcupadas = 0;
      observaciones = null;
      informacionAmpliatoria = null;
    } else if (config.tipo === 'OTROS') {
      totalCamas = 1;
      camasOcupadas = 0;
      observaciones = config.texto || null;
      informacionAmpliatoria = null;
    }

    const payload = {
      habitacion_id: habId,
      fecha,
      tipo_habitacion: TIPO_MAP_DB[config.tipo] || 'otros',
      total_camas: totalCamas,
      camas_ocupadas: camasOcupadas,
      observaciones: observaciones,
      informacion_ampliatoria: informacionAmpliatoria,  // NUEVO
      actualizado_por: null,
      actualizado_en: new Date().toISOString()
    };

    let error;
    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('ocupacion_habitaciones')
        .update(payload)
        .eq('id', existing.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('ocupacion_habitaciones')
        .insert(payload);
      error = insertError;
    }

    if (error) {
      console.error('Error guardando estado de habitación:', error);
      mostrarSplash('Error al guardar estado');
      return;
    }

    mostrarSplash('✅ Estado guardado correctamente');
    setHabitacionesAbiertas(prev => ({
      ...prev,
      [habId]: false
    }));
    
    const habitacion = habitacionesEspeciales.find(h => h.id === habId);
    setHabitacionStatus(prev => ({
      ...prev,
      [habId]: {
        ...config,
        camas: config.tipo === 'INTERNACION' ? totalCamas.toString() : '1',
        texto: config.tipo === 'OTROS' ? config.texto : '',
        camas_ocupadas: config.tipo === 'INTERNACION' ? camasOcupadas.toString() : '0',
        informacion_ampliatoria: config.tipo === 'INTERNACION' ? (informacionAmpliatoria || '') : ''
      }
    }));
    
    if (habitacion) await cargarEstadoHabitaciones([habitacion]);
  } catch (error) {
    console.error('Error guardando estado de habitación:', error);
    mostrarSplash('❌ Error al guardar estado');
  }
};

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
    const createdAt = row?.created_at || row?.fecha || row?.fecha_rechazo || new Date().toISOString();
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

  const rechazosNoLeidos = rechazosPacientes.filter(r => !rechazosLeidos.includes(r.id)).length;

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

  // ==================== FUNCIÓN PARA RECALCULAR STOCK DE UN PISO ====================
  const recalcularStockPiso = async (pisoId) => {
    try {
      const { data: movimientos, error: mError } = await supabase
        .from('movimientos_stock')
        .select('*')
        .eq('piso_id', pisoId)
        .order('created_at', { ascending: true });
      
      if (mError) throw mError;
      
      const stocksIniciales = {};
      ITEMS_REQUERIDOS.forEach(item => {
        stocksIniciales[item] = { pañol: 0, uso: 0, lavadero: 0 };
      });
      
      for (const mov of movimientos) {
        const item = mov.item;
        if (!stocksIniciales[item]) continue;
        
        if (mov.entregado_limpio > 0) {
          stocksIniciales[item].pañol += mov.entregado_limpio;
          stocksIniciales[item].lavadero = Math.max(0, stocksIniciales[item].lavadero - mov.entregado_limpio);
        }
        
        if (mov.egreso_limpio > 0) {
          stocksIniciales[item].pañol -= mov.egreso_limpio;
          stocksIniciales[item].uso += mov.egreso_limpio;
        }
        
        if (mov.retirado_sucio > 0) {
          stocksIniciales[item].uso = Math.max(0, stocksIniciales[item].uso - mov.retirado_sucio);
          stocksIniciales[item].lavadero += mov.retirado_sucio;
        }
      }
      
      for (const item of ITEMS_REQUERIDOS) {
        const { error: upsertError } = await supabase
          .from('stock_piso')
          .upsert({
            piso_id: pisoId,
            item: item,
            stock_pañol: Math.max(0, stocksIniciales[item]?.pañol || 0),
            stock_en_uso: Math.max(0, stocksIniciales[item]?.uso || 0),
            stock_lavadero: Math.max(0, stocksIniciales[item]?.lavadero || 0),
            updated_at: new Date()
          }, { onConflict: 'piso_id,item' });
        
        if (upsertError) console.error(`Error actualizando ${item}:`, upsertError);
      }
      
      return true;
    } catch (error) {
      console.error("Error recalculando stock:", error);
      throw error;
    }
  };



  // ==================== GESTIÓN DE ADMINISTRADORES ====================
  const cargarAdmins = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_acceso')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setAdmins(data || []);
    } catch (error) {
      console.error("Error cargando admins:", error);
    }
  };

  // Funciones de recarga por pestaña
// Funciones de recarga por pestaña
const recargarCroquis = async () => {
  await cargarDatos('croquis');
  await cargarRechazosPacientes();
};
const recargarMonitor = () => cargarDatos('monitor');
const recargarAdmin = async () => {
  setCargandoAdmin(true);
  try {
    // Recargar pisos y habitaciones
    const resPisos = await supabase.from('pisos').select('*').order('nombre_piso');
    const resHabs = await supabase.from('habitaciones_especiales').select('*').order('nombre');
    
    setPisos(resPisos.data || []);
    setHabitacionesEspeciales(resHabs.data || []);
    
    // Recargar admins y visualizadores
    await cargarAdmins();
    await cargarVisualizadores();
    await cargarRechazosPacientes();
    
    // Recargar estado de habitaciones
    await cargarEstadoHabitaciones(resHabs.data || []);
    
    mostrarSplash("✅ Datos actualizados");
  } catch (error) {
    console.error(error);
    mostrarSplash("❌ Error al actualizar");
  } finally {
    setCargandoAdmin(false);
  }
};

  const agregarAdmin = async () => {
    if (!nuevoAdmin.usuario.trim()) {
      mostrarSplash("Ingrese un nombre de usuario");
      return;
    }
    
    if (nuevoAdmin.pin.length < 4) {
      mostrarSplash("El PIN debe tener al menos 4 dígitos");
      return;
    }
    
    if (nuevoAdmin.pin !== nuevoAdmin.confirmarPin) {
      mostrarSplash("Los PINs no coinciden");
      return;
    }
    
    try {
      const salt = bcrypt.genSaltSync(10);
      const pinHash = bcrypt.hashSync(nuevoAdmin.pin, salt);
      
      const { error } = await supabase
        .from('admin_acceso')
        .insert({
          usuario: nuevoAdmin.usuario.toLowerCase().trim(),
          pin_hash: pinHash,
          activo: true,
          created_at: new Date().toISOString()
        });
      
      if (error) {
        if (error.code === '23505') {
          mostrarSplash("Usuario ya existe");
        } else {
          mostrarSplash("❌ Error al crear administrador");
        }
        return;
      }
      
      mostrarSplash(`Administrador ${nuevoAdmin.usuario} creado correctamente`);
      setNuevoAdmin({ usuario: '', pin: '', confirmarPin: '' });
      setMostrarModalAdmin(false);
      cargarAdmins();
      
    } catch (error) {
      console.error("Error:", error);
      mostrarSplash("❌ Error al crear administrador");
    }
  };

  const cambiarEstadoAdmin = async (adminId, estadoActual) => {
    try {
      const { error } = await supabase
        .from('admin_acceso')
        .update({ 
          activo: !estadoActual,
          updated_at: new Date().toISOString()
        })
        .eq('id', adminId);
      
      if (error) throw error;
      
      mostrarSplash(estadoActual ? "Administrador desactivado" : "Administrador activado");
      cargarAdmins();
      
    } catch (error) {
      console.error("Error:", error);
      mostrarSplash("❌ Error al cambiar estado");
    }
  };

  const cambiarPinAdmin = async () => {
    if (nuevoPin.length < 4) {
      mostrarSplash("El PIN debe tener al menos 4 dígitos");
      return;
    }
    
    if (nuevoPin !== confirmarNuevoPin) {
      mostrarSplash("Los PINs no coinciden");
      return;
    }
    
    try {
      const salt = bcrypt.genSaltSync(10);
      const pinHash = bcrypt.hashSync(nuevoPin, salt);
      
      const { error } = await supabase
        .from('admin_acceso')
        .update({ 
          pin_hash: pinHash,
          intentos_fallidos: 0,
          bloqueado_hasta: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', adminSeleccionado.id);
      
      if (error) throw error;
      
      mostrarSplash(`PIN actualizado para ${adminSeleccionado.usuario}`);
      setMostrarModalCambioPin(false);
      setNuevoPin('');
      setConfirmarNuevoPin('');
      cargarAdmins();
      
    } catch (error) {
      console.error("Error:", error);
      mostrarSplash("❌ Error al cambiar PIN");
    }
  };

  const eliminarAdmin = async (adminId, usuario) => {
    if (window.confirm(`¿Eliminar permanentemente al administrador "${usuario}"?\n\nEsta acción no se puede deshacer.`)) {
      try {
        const { error } = await supabase
          .from('admin_acceso')
          .delete()
          .eq('id', adminId);
        
        if (error) throw error;
        
        mostrarSplash(`Administrador ${usuario} eliminado correctamente`);
        cargarAdmins();
        
      } catch (error) {
        console.error("Error:", error);
        mostrarSplash("❌ Error al eliminar administrador");
      }
    }
  };

  const cargarVisualizadores = async () => {
  try {
    const { data, error } = await supabase
      .from('visualizador_acceso')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    setVisualizadores(data || []);
  } catch (error) {
    console.error("Error cargando visualizadores:", error);
  }
};

// Función para agregar visualizador
const agregarVisualizador = async () => {
  if (!nuevoVisualizador.usuario.trim()) {
    mostrarSplash("Ingrese un nombre de usuario");
    return;
  }
  
  if (nuevoVisualizador.pin.length < 4) {
    mostrarSplash("El PIN debe tener al menos 4 dígitos");
    return;
  }
  
  if (nuevoVisualizador.pin !== nuevoVisualizador.confirmarPin) {
    mostrarSplash("Los PINs no coinciden");
    return;
  }
  
  try {
    const salt = bcrypt.genSaltSync(10);
    const pinHash = bcrypt.hashSync(nuevoVisualizador.pin, salt);
    
    const { error } = await supabase
      .from('visualizador_acceso')
      .insert({
        usuario: nuevoVisualizador.usuario.toLowerCase().trim(),
        pin_hash: pinHash,
        activo: true,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      if (error.code === '23505') {
        mostrarSplash("❌ El usuario ya existe");
      } else {
        mostrarSplash("❌ Error al crear visualizador");
      }
      return;
    }
    
    mostrarSplash(`✅ Visualizador ${nuevoVisualizador.usuario} creado`);
    setNuevoVisualizador({ usuario: '', pin: '', confirmarPin: '' });
    setMostrarModalVisualizador(false);
    cargarVisualizadores();
    
  } catch (error) {
    console.error("Error:", error);
    mostrarSplash("❌ Error al crear visualizador");
  }
};

// Función para cambiar PIN de visualizador
const cambiarPinVisualizador = async () => {
  if (nuevoPin.length < 4) {
    mostrarSplash("El PIN debe tener al menos 4 dígitos");
    return;
  }
  
  if (nuevoPin !== confirmarNuevoPin) {
    mostrarSplash("Los PINs no coinciden");
    return;
  }
  
  try {
    const salt = bcrypt.genSaltSync(10);
    const pinHash = bcrypt.hashSync(nuevoPin, salt);
    
    const { error } = await supabase
      .from('visualizador_acceso')
      .update({ 
        pin_hash: pinHash,
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', visualizadorSeleccionado.id);
    
    if (error) throw error;
    
    mostrarSplash(`✅ PIN cambiado para ${visualizadorSeleccionado.usuario}`);
    setMostrarModalCambioPinVisualizador(false);
    setNuevoPin('');
    setConfirmarNuevoPin('');
    cargarVisualizadores();
    
  } catch (error) {
    console.error("Error:", error);
    mostrarSplash("❌ Error al cambiar PIN");
  }
};

// Función para cambiar estado del visualizador
const cambiarEstadoVisualizador = async (visId, estadoActual) => {
  try {
    const { error } = await supabase
      .from('visualizador_acceso')
      .update({ 
        activo: !estadoActual,
        updated_at: new Date().toISOString()
      })
      .eq('id', visId);
    
    if (error) throw error;
    
    mostrarSplash(estadoActual ? "✅ Visualizador desactivado" : "✅ Visualizador activado");
    cargarVisualizadores();
    
  } catch (error) {
    console.error("Error:", error);
    mostrarSplash("❌ Error al cambiar estado");
  }
};

// Función para eliminar visualizador
const eliminarVisualizador = async (visId, usuario) => {
  if (window.confirm(`¿Eliminar permanentemente al visualizador "${usuario}"?\n\nEsta acción no se puede deshacer.`)) {
    try {
      const { error } = await supabase
        .from('visualizador_acceso')
        .delete()
        .eq('id', visId);
      
      if (error) throw error;
      
      mostrarSplash(`✅ Visualizador ${usuario} eliminado`);
      cargarVisualizadores();
      
    } catch (error) {
      console.error("Error:", error);
      mostrarSplash("❌ Error al eliminar visualizador");
    }
  }
};

  // ==================== GENERAR QR PERSONAL ====================
  const generarQRPersonal = async (personal) => {
  try {
    // Generar token único
    const token = crypto.randomUUID ? crypto.randomUUID() : 
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const expiraEn = new Date();
    expiraEn.setMonth(expiraEn.getMonth() + 6);
    
    // Desactivar tokens anteriores
    await supabase
      .from('tokens_acceso')
      .update({ activo: false })
      .eq('dni', personal.dni);
    
    // Guardar nuevo token
    const { error } = await supabase
      .from('tokens_acceso')
      .insert({
        dni: personal.dni,
        token: token,
        activo: true,
        tipo: 'personal',
        creado_en: new Date().toISOString(),
        expira_en: expiraEn.toISOString()
      });
    
    if (error) {
      mostrarSplash("❌ Error al generar QR");
      return;
    }
    
    const qrUrl = `${window.location.origin}/auth/${token}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`;
    const nombreArchivo = `Credencial_${personal.jerarquia}_${personal.apellido}_${personal.nombre}.png`;
    
    // Abrir ventana con la credencial
    const win = window.open('', '_blank', 'width=600,height=700,menubar=no,toolbar=no,location=no');
    
    if (!win) {
      mostrarSplash("❌ El navegador bloqueó la ventana emergente. Permite popups para este sitio.");
      return;
    }
    
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Credencial ${personal.apellido}</title>
          <meta charset="UTF-8">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              background: #1e293b;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              font-family: 'Segoe UI', 'Roboto', system-ui, sans-serif;
              padding: 40px;
            }
            
            .container {
              text-align: center;
            }
            
            /* Tarjeta tamaño crédito */
            .credencial {
              width: 85.6mm;
              height: 53.98mm;
              background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
              border-radius: 3mm;
              box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
              position: relative;
              overflow: hidden;
              border: 1px solid #334155;
              margin-bottom: 20px;
            }
            
            .credencial::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              height: 3px;
              background: linear-gradient(90deg, #3b82f6, #60a5fa, #3b82f6);
            }
            
            .contenido {
              padding: 4mm 3mm;
              height: 100%;
              display: flex;
              gap: 3mm;
            }
            
            .lado-qr {
              flex-shrink: 0;
              width: 34mm;
              text-align: center;
            }
            
            .qr-container {
              background: white;
              padding: 2mm;
              border-radius: 2mm;
              border: 1px solid #334155;
            }
            
            .qr-container img {
              width: 30mm;
              height: 30mm;
              display: block;
            }
            
            .qr-label {
              font-size: 2mm;
              color: #94a3b8;
              margin-top: 1.5mm;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            
            .lado-info {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }
            
            .header {
              text-align: center;
              margin-bottom: 2mm;
            }
            
            .logo {
              width: 12mm;
              height: auto;
              margin-bottom: 1mm;
              display: inline-block;
            }
            
            /* SVG alternativo si no hay logo */
            .logo-placeholder {
              width: 12mm;
              height: 12mm;
              margin: 0 auto 1mm;
              background: #3b82f6;
              border-radius: 2mm;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 5mm;
              font-weight: bold;
            }
            
            .hospital {
              font-size: 3mm;
              font-weight: 800;
              color: white;
              letter-spacing: 0.5px;
              line-height: 1.2;
            }
            
            .departamento {
              font-size: 2.2mm;
              color: #60a5fa;
              font-weight: 600;
              letter-spacing: 0.3px;
            }
            
            .datos {
              text-align: center;
              margin: 2mm 0;
            }
            
            .jerarquia {
              font-size: 2.8mm;
              font-weight: 800;
              color: #60a5fa;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 1mm;
            }
            
            .nombre {
              font-size: 3.2mm;
              font-weight: 700;
              color: white;
              line-height: 1.3;
            }
            
            .rol {
              display: inline-block;
              background: #1e40af;
              color: #93c5fd;
              font-size: 2mm;
              font-weight: 700;
              padding: 0.5mm 2mm;
              border-radius: 3mm;
              margin-top: 1.5mm;
              text-transform: uppercase;
            }
            
            .footer {
              text-align: center;
              border-top: 0.5px solid #334155;
              padding-top: 1.5mm;
              margin-top: 1mm;
            }
            
            .valido {
              font-size: 2mm;
              color: #94a3b8;
              font-weight: 500;
            }
            
            .valido span {
              font-weight: 700;
              color: #34d399;
            }
            
            .mensaje {
              font-size: 1.8mm;
              color: #64748b;
              margin-top: 1mm;
            }
            
            .botones {
              margin-top: 20px;
              display: flex;
              gap: 10px;
              justify-content: center;
            }
            
            button {
              background: #2563eb;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 10px;
              font-size: 14px;
              font-weight: bold;
              cursor: pointer;
              transition: all 0.2s;
            }
            
            button:hover {
              background: #1d4ed8;
              transform: scale(1.02);
            }
            
            .info {
              margin-top: 20px;
              padding: 12px;
              background: #334155;
              border-radius: 8px;
              font-size: 12px;
              color: #cbd5e1;
              text-align: left;
            }
            
            .info strong {
              color: #60a5fa;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div id="credencial" class="credencial">
              <div class="contenido">
                <div class="lado-qr">
                  <div class="qr-container">
                    <img src="${qrCodeUrl}" alt="QR de acceso" />
                  </div>
                  <div class="qr-label">
                    ACCESO<br>HOTELERÍA
                  </div>
                </div>
                
                <div class="lado-info">
                  <div class="header">
                    <div id="logo-container"></div>
                    <div class="hospital">HOSPITAL NAVAL</div>
                    <div class="hospital" style="font-size:2.5mm">BUENOS AIRES</div>
                    <div class="departamento">DEPARTAMENTO HOTELERÍA</div>
                  </div>
                  
                  <div class="datos">
                    <div class="jerarquia">${personal.jerarquia || 'OPERADOR'}</div>
                    <div class="nombre">${personal.apellido}, ${personal.nombre}</div>
                    <div class="rol">${personal.rol?.toUpperCase() || 'PAÑOLERO'}</div>
                  </div>
                  
                  <div class="footer">
                    <div class="valido">
                      VÁLIDO HASTA: <span>${expiraEn.toLocaleDateString('es-AR')}</span>
                    </div>
                    <div class="mensaje">
                      PERSONAL E INTRANSFERIBLE
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="botones">
              <button id="btnGuardar">📸 GUARDAR COMO IMAGEN</button>
              <button id="btnCerrar" style="background:#475569">✖️ CERRAR</button>
            </div>
            
            <div class="info">
              <strong>💡 Para Word:</strong> Guarda la imagen y luego inserta en Word.<br>
              <strong>📄 En una hoja A4 entran 8 credenciales (4x2).</strong> Ajusta el tamaño de la imagen a <strong>8.56cm x 5.4cm</strong>.
            </div>
          </div>
          
          <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
          <script>
            // Función para cargar el logo
            function cargarLogo() {
              const logoContainer = document.getElementById('logo-container');
              const img = new Image();
              img.crossOrigin = "Anonymous";
              img.onload = function() {
                img.className = 'logo';
                img.style.width = '12mm';
                img.style.height = 'auto';
                logoContainer.appendChild(img);
              };
              img.onerror = function() {
                // Si no hay logo, mostrar un placeholder
                const placeholder = document.createElement('div');
                placeholder.className = 'logo-placeholder';
                placeholder.innerHTML = '🏥';
                placeholder.style.width = '12mm';
                placeholder.style.height = '12mm';
                placeholder.style.margin = '0 auto 1mm';
                placeholder.style.background = '#3b82f6';
                placeholder.style.borderRadius = '2mm';
                placeholder.style.display = 'flex';
                placeholder.style.alignItems = 'center';
                placeholder.style.justifyContent = 'center';
                placeholder.style.color = 'white';
                placeholder.style.fontSize = '6mm';
                logoContainer.appendChild(placeholder);
              };
              img.src = '/images/logo-hospital.png?' + Date.now(); // Agregar timestamp para evitar caché
            }
            
            // Función para guardar imagen
            function guardarImagen() {
              const element = document.getElementById('credencial');
              
              // Mostrar indicador de carga
              const btn = document.getElementById('btnGuardar');
              const textoOriginal = btn.innerHTML;
              btn.innerHTML = '⏳ GENERANDO...';
              btn.disabled = true;
              
              html2canvas(element, {
                scale: 4,
                backgroundColor: null,
                logging: false,
                useCORS: true,
                allowTaint: false
              }).then(canvas => {
                // Crear link de descarga
                const link = document.createElement('a');
                link.download = '${nombreArchivo}';
                link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Restaurar botón
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
                
                // Mostrar mensaje de éxito
                const infoDiv = document.querySelector('.info');
                const oldHTML = infoDiv.innerHTML;
                infoDiv.innerHTML = '<strong>✅ IMAGEN GUARDADA CORRECTAMENTE</strong><br>' + oldHTML;
                setTimeout(() => {
                  infoDiv.innerHTML = oldHTML;
                }, 3000);
                
              }).catch(error => {
                console.error('Error:', error);
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
                alert('❌ Error al capturar la imagen. Intenta nuevamente.');
              });
            }
            
            // Configurar eventos cuando la página cargue
            window.onload = function() {
              cargarLogo();
              
              const btnGuardar = document.getElementById('btnGuardar');
              const btnCerrar = document.getElementById('btnCerrar');
              
              btnGuardar.onclick = guardarImagen;
              btnCerrar.onclick = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
    
    mostrarSplash(`✅ Credencial generada para ${personal.apellido}`);
    
  } catch (error) {
    console.error("Error generando QR:", error);
    mostrarSplash("❌ Error al generar credencial");
  }
};

  // ==================== ELIMINAR MOVIMIENTO ====================
  const eliminarMovimiento = async (id) => {
    if (window.confirm("⚠️ ¿ELIMINAR REGISTRO?\n\nEl stock se recalculará automáticamente después de eliminar.")) {
      mostrarSplash("🗑️ ELIMINANDO REGISTRO...");
      
      try {
        const { data: movimiento, error: getError } = await supabase
          .from('movimientos_stock')
          .select('piso_id')
          .eq('id', id)
          .single();
        
        if (getError) throw getError;
        
        const { error: delError } = await supabase
          .from('movimientos_stock')
          .delete()
          .eq('id', id);
        
        if (delError) throw delError;
        
        mostrarSplash("Recalculando stock...");
        await recalcularStockPiso(movimiento.piso_id);
        mostrarSplash("✅ Registro eliminado y stock actualizado");
        cargarDatos();
        
      } catch (error) {
        console.error("Error:", error);
        mostrarSplash("❌ ERROR AL ELIMINAR");
      }
    }
  };

  // ==================== ELIMINAR PISO ====================
  const eliminarPiso = async (pisoId, pisoNombre) => {
    if (window.confirm(`⚠️ ¿ELIMINAR COMPLETAMENTE el piso "${pisoNombre}"?\n\nSe eliminarán todos los registros asociados.\n\nEsta acción NO SE PUEDE DESHACER.`)) {
      mostrarSplash("🗑️ ELIMINANDO PISO...");
      
      try {
        await supabase.from('movimientos_stock').delete().eq('piso_id', pisoId);
        await supabase.from('stock_piso').delete().eq('piso_id', pisoId);
        await supabase.from('habitaciones_especiales').delete().eq('piso_id', pisoId);
        await supabase.from('pisos').delete().eq('id', pisoId);
        
        mostrarSplash(`✅ PISO "${pisoNombre}" ELIMINADO`);
        cargarDatos();
      } catch (error) {
        console.error("Error:", error);
        mostrarSplash("❌ ERROR AL ELIMINAR");
      }
    }
  };

  // ==================== GESTIÓN DE PERSONAL ====================
  const agregarPersonal = async (e) => {
    e.preventDefault();
    if (!nuevoMiembro.dni || !nuevoMiembro.nombre || !nuevoMiembro.apellido) {
      mostrarSplash("Complete todos los campos");
      return;
    }

    const rolesPermitidos = ['pañolero', 'operador', 'encargado_piso'];
    if (!rolesPermitidos.includes(nuevoMiembro.rol)) {
      mostrarSplash("❌ Rol no permitido en Tripulación");
      return;
    }

    // DNI es TEXT en la DB, pero validamos que contenga solo dígitos
    const dniTexto = String(nuevoMiembro.dni || '').trim();
    if (!/^\d+$/.test(dniTexto)) {
      mostrarSplash("❌ DNI debe ser un número válido");
      return;
    }

    const personalToInsert = {
      dni: dniTexto,
      nombre: nuevoMiembro.nombre.trim(),
      apellido: nuevoMiembro.apellido.trim(),
      jerarquia: nuevoMiembro.jerarquia.trim(),
      celular: nuevoMiembro.celular?.trim() || null,
      rol: nuevoMiembro.rol
    };

    const { error } = await supabase.from('personal').insert([personalToInsert]);
    if (!error) {
      setNuevoMiembro({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' });
      mostrarSplash("✅ Personal registrado");
      setMostrarModalPersonal(false);
      cargarDatos();
    } else {
      console.error("Error al registrar personal:", error);
      const errorMsg = error?.message || error?.hint || "Error desconocido";
      const esConstraintRol =
        String(error?.message || '').toLowerCase().includes('personal_rol_check') ||
        String(error?.message || '').toLowerCase().includes('check constraint');

      if (esConstraintRol) {
        mostrarSplash("❌ Tu DB no permite este rol. Actualizá el CHECK de personal.rol en Supabase.");
      } else {
        mostrarSplash(`❌ Error: ${errorMsg}`);
      }
    }
  };

  const eliminarPersonal = async (dni, nombre) => {
    if (window.confirm(`¿Eliminar al personal "${nombre}"?`)) {
      const { error } = await supabase.from('personal').delete().eq('dni', dni);
      if (!error) { 
        mostrarSplash("✅ Personal eliminado"); 
        cargarDatos(); 
      } else {
        mostrarSplash("❌ Error al eliminar");
      }
    }
  };

  // ==================== GESTIÓN DE PISOS ====================
  const agregarPiso = async (e) => {
    e.preventDefault();
    if (!nuevoPiso.nombre_piso.trim()) {
      mostrarSplash("Ingrese un nombre para el sector");
      return;
    }
    const slug = nuevoPiso.nombre_piso.toLowerCase().replace(/ /g, '-');
    const { error } = await supabase.from('pisos').insert([{ nombre_piso: nuevoPiso.nombre_piso.trim(), slug }]);
    if (!error) {
      setNuevoPiso({ nombre_piso: '' });
      mostrarSplash("✅ Sector creado");
      setMostrarModalPiso(false);
      cargarDatos();
    } else {
      mostrarSplash("❌ Error al crear sector");
    }
  };

  // ==================== GESTIÓN DE HABITACIONES ====================
  const agregarHabitacion = async (pisoId, pisoSlug) => {
    const nombre = prompt("Nombre de la Habitación (Ej: Medico Interno):");
    if(nombre && nombre.trim()) {
      const slugH = `${pisoSlug}-${nombre.toLowerCase().replace(/ /g, '-')}`;
      const { error } = await supabase.from('habitaciones_especiales').insert([{ piso_id: pisoId, nombre: nombre.trim(), slug: slugH }]);
      if(!error) { 
        mostrarSplash("✅ Habitación Guardada"); 
        cargarDatos(); 
      } else {
        mostrarSplash("❌ Error al guardar");
      }
    }
  };

  const eliminarHabitacion = async (id, nombre) => {
    if(window.confirm(`¿Eliminar habitación "${nombre}"?`)) { 
      const { error } = await supabase.from('habitaciones_especiales').delete().eq('id', id); 
      if(!error) { 
        mostrarSplash("✅ Habitación eliminada"); 
        cargarDatos(); 
      } else {
        mostrarSplash("❌ Error al eliminar");
      }
    }
  };

  // ==================== GENERAR QR ====================
  const descargarQR = (path, titulo, textoAdicional = '') => {
  const urlApp = `${window.location.origin}${path}`; 
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`;
  const win = window.open('', '_blank');
  
  const textoExtra = textoAdicional ? `<p style="margin-top:10px;font-size:12px;color:#666;max-width:300px;background:#f0f0f0;padding:8px;border-radius:8px;">${textoAdicional}</p>` : '';
  
  win.document.write(`<html><head><title>${titulo}</title><style>
    body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;background:#f5f5f5}
    .container{background:white;padding:30px;border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,0.1)}
    h1{text-transform:uppercase;font-size:20px;margin-bottom:10px;font-weight:900;color:#1e293b}
    h2{font-size:16px;color:#475569;margin-bottom:20px}
    img{width:280px;margin:10px auto;border:1px solid #e2e8f0;border-radius:10px;padding:10px}
    p{margin-top:15px;font-size:14px;font-weight:bold;color:#3b82f6}
    .info{font-size:11px;color:#94a3b8;margin-top:10px}
    @media print { button { display: none; } }
  </style></head><body>
    <div class="container">
      <h1>${titulo.split(' - ')[0]}</h1>
      <h2>${titulo.split(' - ')[1] || ''}</h2>
      <img src="${qrUrl}" />
      ${textoExtra}
      <p>Dpto. Hotelería - HNPM</p>
      <div class="info">Escanee este código QR</div>
      <button onclick="window.print()" style="margin-top:20px;padding:10px 20px;font-size:14px;background:#3b82f6;color:white;border:none;border-radius:10px;cursor:pointer">🖨️ Imprimir</button>
      <script>setTimeout(()=>{window.close()},30000)</script>
    </div>
  </body></html>`);
  win.document.close();
};

  // ==================== TOGGLE AUDITORÍA ====================
  const toggleAuditoria = async () => {
    const nuevoEstado = !auditoriaHabilitada;
    await supabase.from('configuracion_sistema').upsert({ clave: 'MODO_AUDITORIA', valor: nuevoEstado.toString() });
    setAuditoriaHabilitada(nuevoEstado);
    mostrarSplash(nuevoEstado ? "🔴 AUDITORÍA ACTIVADA" : "🟢 AUDITORÍA CERRADA");
  };

  // ==================== CALCULAR TOTAL GLOBAL ====================
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

  // ==================== FORMATEAR FECHA ====================
  const formatearFechaGuardia = (fechaISO) => {
    const fecha = new Date(fechaISO);
    const opciones = { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return fecha.toLocaleDateString('es-AR', opciones);
  };

  // ==================== FUNCIONES PARA ESTADOS ====================
  const filtrarHabitacionesPorTipo = (tipo) => {
    const resultado = habitaciones.filter(habitacion => {
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
          return ocu && ocu.tipo_habitacion === 'otros';
        default:
          return false;
      }
    });
    
    // Debug para OTROS - investigar discrepancia BD vs App
    if (tipo === 'otros') {
      console.log('=== DEBUG: Investigando discrepancia OTROS ===');
      console.log('Base de datos (esperado): 51 habitaciones OTROS');
      console.log('Aplicación (mostrado):', resultado.length, 'habitaciones OTROS');
      console.log('Total habitaciones cargadas:', habitaciones.length);
      console.log('Total ocupación cargada:', Object.keys(ocupacion).length);
      
      // Contar cuántos registros OTROS hay en ocupación
      const otrosEnOcupacion = Object.values(ocupacion).filter(ocu => ocu.tipo_habitacion === 'otros');
      console.log('Registros OTROS en ocupación:', otrosEnOcupacion.length);
      
      // Verificar habitaciones OTROS que no tienen habitación correspondiente
      const habitacionIds = new Set(habitaciones.map(h => String(h.id)));
      const otrosSinHabitacion = otrosEnOcupacion.filter(ocu => !habitacionIds.has(String(ocu.habitacion_id)));
      console.log('OTROS sin habitación correspondiente:', otrosSinHabitacion.length);
      
      if (otrosSinHabitacion.length > 0) {
        console.log('Detalles de OTROS sin habitación:', otrosSinHabitacion.map(ocu => ({
          habitacion_id: ocu.habitacion_id,
          piso_id: ocu.piso_id,
          observaciones: ocu.observaciones
        })));
      }
    }
    
    return resultado;
  };

  const generarPDFHabitaciones = () => {
    // Importar jsPDF y jspdf-autotable dinámicamente
    Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]).then(([jsPDF, autoTable]) => {
      const doc = new jsPDF.default();
      
      // Agregar autoTable al documento
      autoTable.default(doc);
      
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
            const ocu = ocupacion[String(habitacion.id)];
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
            const piso = pisos.find(p => String(p.id) === String(habitacion.piso_id));
            
            return [
              piso?.nombre_piso || 'Sin piso',
              habitacion.nombre || 'Sin nombre',
              'Sin novedad'
            ];
          });
          break;
        case 'otros':
          titulo = 'Habitaciones OTROS';
          datosTabla = filtrarHabitacionesPorTipo('otros').map(habitacion => {
            const ocu = ocupacion[String(habitacion.id)];
            const piso = pisos.find(p => String(p.id) === String(habitacion.piso_id));
            
            return [
              piso?.nombre_piso || 'Sin piso',
              habitacion.nombre || 'Sin nombre',
              ocu?.observaciones || 'Sin novedades'
            ];
          });
          break;
        case 'ocupacion':
          titulo = 'Habitaciones Ocupadas';
          datosTabla = filtrarHabitacionesPorTipo('ocupacion').map(habitacion => {
            const ocu = ocupacion[String(habitacion.id)];
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
        head: [headers],
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

  // ==================== RENDER ====================
  return (
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full">
        <button 
          onClick={() => setActiveTab('croquis')} 
          className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeTab === 'croquis' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Hotelería
        </button>
        <button 
          onClick={() => setActiveTab('recorridos')} 
          className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeTab === 'recorridos' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Recorridos
        </button>
        <button 
          onClick={() => setActiveTab('historial')} 
          className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Monitor
        </button>
        <button 
          onClick={() => setActiveTab('estados')} 
          className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeTab === 'estados' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Estados
        </button>
        <button 
          onClick={() => setActiveTab('admin')} 
          className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Admin
        </button>
      </div>
      {/* Panel CROQUIS - Monitor de ocupacion*/}
      {activeTab === 'croquis' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <h2 className="text-lg sm:text-2xl font-semibold text-white uppercase tracking-tighter">
              HOTELERIA
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
                onChange={async (e) => {
                  const nuevoPisoId = e.target.value;
                  setCargandoCroquis(true);
                  setPisoSeleccionado(nuevoPisoId);
                  
                  // Forzar recarga de habitaciones para ese piso
                  const { data: nuevasHabitaciones } = await supabase
                    .from('habitaciones_especiales')
                    .select('*')
                    .eq('piso_id', nuevoPisoId)
                    .order('nombre');
                  
                  setHabitacionesEspeciales(prev => {
                    const otras = prev.filter(h => h.piso_id !== nuevoPisoId);
                    return [...otras, ...(nuevasHabitaciones || [])];
                  });
                  
                  setCroquisKey(prev => prev + 1);
                  setCargandoCroquis(false);
                }}
                className="flex-1 min-w-[120px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value="">Seleccionar piso...</option>
                {pisos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre_piso}</option>
                ))}
              </select>
              <button
                onClick={recargarCroquis}
                disabled={cargandoCroquis}
                className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1 px-3 py-2 rounded-xl hover:bg-slate-800"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Actualizar
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
            />
          ) : (
            <div className="bg-slate-800 rounded-xl p-12 text-center">
              <p className="text-slate-400">Selecciona un piso para ver su plano</p>
            </div>
          )}
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
          <RecorridosList />
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
              className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeEstadosTab === 'internacion' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Internación
            </button>
            <button 
              onClick={() => setActiveEstadosTab('reparacion')} 
              className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeEstadosTab === 'reparacion' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Reparación
            </button>
            <button 
              onClick={() => setActiveEstadosTab('otros')} 
              className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeEstadosTab === 'otros' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              OTROS
            </button>
            <button 
              onClick={() => setActiveEstadosTab('ocupacion')} 
              className={`flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-semibold uppercase transition-all ${activeEstadosTab === 'ocupacion' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
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
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-1">OTROS</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {filtrarHabitacionesPorTipo('otros').length}
                  </div>
                  <div className="text-xs text-slate-500">Total de habitaciones OTROS</div>
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
                        const ocu = ocupacion[String(hab.id)];
                        return total + (ocu?.camas_ocupadas || 0);
                      }, 0)}
                    </div>
                    <div className="text-xs text-slate-500">Total de camas ocupadas</div>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Camas bloqueadas por patologías</div>
                    <div className="text-2xl font-bold text-red-400">
                      {filtrarHabitacionesPorTipo('ocupacion').reduce((total, hab) => {
                        const ocu = ocupacion[String(hab.id)];
                        return total + (ocu?.observaciones?.includes('AISLAMIENTO') ? (ocu?.camas_ocupadas || 0) : 0);
                      }, 0)}
                    </div>
                    <div className="text-xs text-slate-500">Total de camas bloqueadas por patologías</div>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Camas disponibles</div>
                    <div className="text-2xl font-bold text-green-400">
                      {filtrarHabitacionesPorTipo('ocupacion').reduce((total, hab) => {
                        const ocu = ocupacion[String(hab.id)];
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
                        <td className="px-4 py-3 text-slate-200 max-w-xs truncate" title={
                          activeEstadosTab === 'otros' 
                            ? (ocu?.observaciones || 'Sin novedades')
                            : (ocu?.informacion_ampliatoria || 'Sin novedades')
                        }>
                          {activeEstadosTab === 'internacion' || activeEstadosTab === 'ocupacion' 
                            ? (ocu?.informacion_ampliatoria || 'Sin novedades')
                            : activeEstadosTab === 'otros'
                              ? (ocu?.observaciones || 'Sin novedades')
                              : 'Sin novedad'
                          }
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

      {/* Panel HISTORIAL - Monitor de stock */}
      {activeTab === 'historial' && (
  <div className="space-y-8">
    <div className="flex justify-between items-center">
      <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">Control de Activos</h2>
      <button
          onClick={recargarMonitor}
          disabled={cargandoMonitor}
          className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
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
      </>
    )}
  </div>
)}

      {/* Panel ADMINISTRACIÓN */}
      {activeTab === 'admin' && (
  <div className="space-y-6">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">Administración</h2>
      <button
          onClick={recargarAdmin}
          disabled={cargandoAdmin}
          className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
    </div>
    
    {cargandoAdmin ? (
      <SpinnerCarga mensaje="CARGANDO CONFIGURACIÓN..." />
    ) : (
      <>
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

        {/* Gestión de Visualizadores */}
<section className="bg-slate-900 p-6 rounded-2xl border border-green-800/30 mt-6">
  <div className="flex justify-between items-center mb-4">
    <div>
      <h3 className="text-lg font-semibold text-green-400 uppercase tracking-wider">
        👁️ Visualizadores (Acceso con PIN)
      </h3>
      <p className="text-xs text-slate-500 mt-1">Usuarios con acceso de solo lectura</p>
    </div>
    <button
      onClick={() => setMostrarModalVisualizador(true)}
      className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-xl text-sm font-black uppercase transition-all"
    >
      + Nuevo Visualizador
    </button>
  </div>
  
  <div className="space-y-2 max-h-96 overflow-y-auto">
    {visualizadores.length > 0 ? (
      visualizadores.map(vis => (
        <div key={vis.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-green-800/50 transition-all">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white uppercase">
                  {vis.usuario}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  vis.activo ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                }`}>
                  {vis.activo ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
              <div className="flex gap-3 mt-1 text-[10px] text-slate-500 flex-wrap">
                <span>🕐 Creado: {new Date(vis.created_at).toLocaleDateString()}</span>
                {vis.ultimo_acceso && (
                  <span>📱 Último acceso: {new Date(vis.ultimo_acceso).toLocaleString()}</span>
                )}
                {vis.intentos_fallidos > 0 && (
                  <span className="text-orange-400">⚠️ Intentos fallidos: {vis.intentos_fallidos}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setVisualizadorSeleccionado(vis);
                  setMostrarModalCambioPinVisualizador(true);
                }}
                className="px-3 py-1.5 bg-yellow-600/20 text-yellow-400 rounded-lg text-xs font-semibold hover:bg-yellow-600 hover:text-white transition-all"
                title="Cambiar PIN"
              >
                🔑 Cambiar PIN
              </button>
              <button
                onClick={() => cambiarEstadoVisualizador(vis.id, vis.activo)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  vis.activo 
                    ? 'bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white'
                    : 'bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white'
                }`}
              >
                {vis.activo ? '🔴 Desactivar' : '🟢 Activar'}
              </button>
              <button
                onClick={() => eliminarVisualizador(vis.id, vis.usuario)}
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
        📭 No hay visualizadores registrados
      </div>
    )}
  </div>
</section>

        {/* Gestión de Personal */}
        <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-500 uppercase tracking-wider">👥 Tripulación</h3>
              <p className="text-xs text-slate-500 mt-1">Personal operativo con acceso por QR (no incluye Administradores ni Visualizadores)</p>
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
                    <span className="text-blue-500 opacity-50 ml-2 text-[10px]">[{ROLE_LABELS_TRIPULACION[p.rol] || String(p.rol || '').toUpperCase()}]</span>
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
                  
                  {/* Habitaciones */}
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
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-semibold uppercase tracking-wider text-slate-300">{hab.nombre}</div>
                                        {config.tipo === 'OTROS' && (
                                        <button
                                          onClick={(e) => { 
                                            e.stopPropagation(); 
                                            const textoAmpliatorio = config.texto?.trim() || 'Sector especial';
                                            descargarQR(
                                              `/habitacion/${hab.slug}`, 
                                              `${hab.nombre} - ${p.nombre_piso}`,
                                              `📝 ${textoAmpliatorio} - Ropa de cama y blancos`
                                            ); 
                                          }}
                                          className="inline-flex items-center gap-1 bg-slate-700/70 text-slate-200 border border-slate-500/30 px-1.5 py-0.5 rounded-lg text-[8px] font-semibold uppercase hover:bg-slate-600 transition-all"
                                        >
                                          🧺 Ropa
                                        </button>
                                      )}
                                      </div>
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] ${statusText} w-full max-w-[240px] truncate block mt-1`}>
                                      {truncarTexto(formatearResumenHabitacion(config), 28)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 ml-2">
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
                                      <>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                          <input
                                            type="number"
                                            min="0"
                                            value={config.camas}
                                            onChange={(e) => actualizarHabitacionStatus(hab.id, 'camas', e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                            placeholder="Camas totales"
                                          />
                                          <div className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-300 text-xs uppercase tracking-[0.1em]">
                                            {config.camas_ocupadas ? `Ocupadas: ${config.camas_ocupadas}` : 'Sin ocupación registrada'}
                                          </div>
                                        </div>
                                        
                                        {/* NUEVO TEXTBOX - Información ampliatoria */}
                                        <div>
                                          <input
                                            type="text"
                                            value={config.informacion_ampliatoria || ''}
                                            onChange={(e) => actualizarHabitacionStatus(hab.id, 'informacion_ampliatoria', e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                                            placeholder="Especialidad / Servicio (Ej: Pediatría, Clínica I, UTI)"
                                          />
                                        </div>
                                      </>
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
    onClick={(e) => { 
      e.stopPropagation(); 
      const textoAmpliatorio = config.texto?.trim() || 'Sector especial';
      descargarQR(
        `/habitacion/${hab.slug}`, 
        `${hab.nombre} - ${p.nombre_piso}`,
        `📝 ${textoAmpliatorio} - Ropa de cama y blancos`
      ); 
    }}
    className="inline-flex items-center gap-1 bg-slate-700/70 text-slate-200 border border-slate-500/30 px-1.5 py-0.5 rounded-lg text-[8px] font-semibold uppercase hover:bg-slate-600 transition-all"
  >
    🧺 Ropa
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
      </>
    )}
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

      {/* Modal para crear nuevo visualizador */}
{mostrarModalVisualizador && (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-green-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-black text-green-400">Nuevo Visualizador</h3>
        <button 
          onClick={() => setMostrarModalVisualizador(false)}
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
            value={nuevoVisualizador.usuario}
            onChange={(e) => setNuevoVisualizador({...nuevoVisualizador, usuario: e.target.value})}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-green-500"
            placeholder="ej: visualizador1, supervisor, etc"
            autoComplete="off"
          />
        </div>
        
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
            PIN (mínimo 4 dígitos)
          </label>
          <input
            type="password"
            value={nuevoVisualizador.pin}
            onChange={(e) => setNuevoVisualizador({...nuevoVisualizador, pin: e.target.value})}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-green-500"
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
            value={nuevoVisualizador.confirmarPin}
            onChange={(e) => setNuevoVisualizador({...nuevoVisualizador, confirmarPin: e.target.value})}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-green-500"
            placeholder="••••"
            maxLength="6"
          />
        </div>
        
        <button
          onClick={agregarVisualizador}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-3 rounded-xl transition-all mt-4"
        >
          Crear Visualizador
        </button>
      </div>
    </div>
  </div>
)}

{/* Modal para cambiar PIN de visualizador */}
{mostrarModalCambioPinVisualizador && visualizadorSeleccionado && (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-yellow-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-black text-yellow-400">
          Cambiar PIN - {visualizadorSeleccionado.usuario}
        </h3>
        <button 
          onClick={() => {
            setMostrarModalCambioPinVisualizador(false);
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
          onClick={cambiarPinVisualizador}
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
                placeholder="Jerarquía (Ej: Operador)" 
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
                <option value="pañolero">Pañolero</option>
                <option value="operador">Operador</option>
                <option value="encargado_piso">Encargado de Piso</option>
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
                          📅 {new Date(rechazo.createdAt).toLocaleDateString('es-AR')} 🕐 {new Date(rechazo.createdAt).toLocaleTimeString('es-AR')}
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

      {/* Notificaciones flotantes */}
      {notificacion.visible && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-slate-200 px-4 py-3 rounded-lg shadow-lg font-medium text-sm z-[100] border border-slate-600">
          {notificacion.mensaje}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;