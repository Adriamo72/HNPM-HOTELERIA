import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = [
  'SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 
  'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'
];

const FormularioPiso = ({ dniPañolero, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [enfermeros, setEnfermeros] = useState([]);
  const [modo, setModo] = useState('piso'); 
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [registrosSesion, setRegistrosSesion] = useState([]); // Tabla temporal de la guardia
  
  const [datos, setDatos] = useState({
    item: 'SABANAS', entregado_limpio: 0, retirado_sucio: 0, stock_fisico_piso: 0,
    dni_enfermero: '', comentarios: ''
  });

  useEffect(() => { cargarContexto(); }, [slugPiso]);

  const mostrarSplash = (mensaje) => {
    setNotificacion({ visible: true, mensaje });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 3000);
  };

  const cargarContexto = async () => {
    const { data: dataPiso } = await supabase.from('pisos').select('*').eq('slug', slugPiso).single();
    if (dataPiso) {
      setPiso(dataPiso);
      const { data: dataEnf } = await supabase.from('personal').select('*').eq('rol', 'enfermero').order('apellido');
      setEnfermeros(dataEnf || []);
    }
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    if (modo === 'piso' && !datos.dni_enfermero) return mostrarSplash("Seleccione Enfermero");

    const nuevoRegistro = {
      piso_id: piso.id,
      dni_pañolero: dniPañolero,
      dni_enfermero: modo === 'piso' ? datos.dni_enfermero : null,
      item: datos.item,
      entregado_limpio: modo === 'piso' ? parseInt(datos.entregado_limpio) : 0,
      retirado_sucio: modo === 'lavadero' ? parseInt(datos.retirado_sucio) : 0,
      stock_fisico_piso: modo === 'piso' ? parseInt(datos.stock_fisico_piso) : 0,
      comentarios: `Registro desde ${modo.toUpperCase()} - ${datos.comentarios}`,
      hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    };

    const { error } = await supabase.from('movimientos_stock').insert([nuevoRegistro]);

    if (error) mostrarSplash("Error al registrar");
    else {
      mostrarSplash(`REGISTRO EXITOSO: ${datos.item}`);
      // Añadimos a la tabla visual del pañolero
      setRegistrosSesion([nuevoRegistro, ...registrosSesion]);
      setDatos({ ...datos, entregado_limpio: 0, retirado_sucio: 0, stock_fisico_piso: 0, comentarios: '' });
    }
  };

  const descargarReporte = () => {
    const fecha = new Date().toLocaleDateString('es-AR');
    let contenido = `SENTINEL HNPM - REPORTE DE GUARDIA\n`;
    contenido += `Fecha: ${fecha}\n`;
    contenido += `Operador DNI: ${dniPañolero}\n`;
    contenido += `Sector: ${piso.nombre_piso}\n`;
    contenido += `-------------------------------------------\n\n`;
    
    registrosSesion.forEach(r => {
      contenido += `[${r.hora}] ${r.item}: `;
      if (r.entregado_limpio > 0) contenido += `Limpio: +${r.entregado_limpio} `;
      if (r.retirado_sucio > 0) contenido += `Sucio: -${r.retirado_sucio} `;
      contenido += `\n`;
    });

    const element = document.createElement("a");
    const file = new Blob([contenido], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `Guardia_${piso.slug}_${fecha}.txt`;
    document.body.appendChild(element);
    element.click();
  };

  if (!piso) return <div className="p-10 text-white text-center animate-pulse tracking-widest uppercase">Sentinel: Sincronizando Sector...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200 pb-20">
      {notificacion.visible && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-50 bg-blue-600 px-8 py-4 rounded-2xl shadow-2xl border-2 border-blue-400 animate-bounce">
          <p className="text-white font-black uppercase text-center text-xs tracking-widest">{notificacion.mensaje}</p>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-2xl font-black text-blue-500 uppercase italic leading-none">{piso.nombre_piso}</h2>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Manifiesto de Carga y Descarga</p>
      </div>

      {/* Selector de Modo */}
      <div className="flex gap-2 mb-6 bg-slate-900 p-1 rounded-2xl border border-slate-800">
        <button onClick={() => setModo('piso')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'piso' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Entrega en Piso</button>
        <button onClick={() => setModo('lavadero')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'lavadero' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500'}`}>Recuento Lavadero</button>
      </div>

      <form onSubmit={enviarRegistro} className="space-y-4 bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl mb-8">
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">Prenda</label>
          <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 font-bold text-blue-300" value={datos.item} onChange={e => setDatos({...datos, item: e.target.value})}>
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {modo === 'piso' ? (
          <>
            <select className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm mb-4" value={datos.dni_enfermero} onChange={e => setDatos({...datos, dni_enfermero: e.target.value})} required>
              <option value="">Responsable de Piso...</option>
              {enfermeros.map(enf => <option key={enf.dni} value={enf.dni}>{enf.apellido}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <label className="text-[8px] font-black text-blue-500 uppercase block mb-1">Carga Limpio</label>
                <input type="number" className="bg-transparent w-full text-2xl font-black outline-none" value={datos.entregado_limpio} onChange={e => setDatos({...datos, entregado_limpio: e.target.value})} />
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <label className="text-[8px] font-black text-blue-400 uppercase block mb-1">Stock Estante</label>
                <input type="number" className="bg-transparent w-full text-2xl font-black outline-none" value={datos.stock_fisico_piso} onChange={e => setDatos({...datos, stock_fisico_piso: e.target.value})} />
              </div>
            </div>
          </>
        ) : (
          <div className="bg-slate-950 p-6 rounded-2xl border border-green-900/30">
            <label className="text-[10px] font-black text-green-500 uppercase block text-center mb-2 tracking-widest">Recuento Sucio en Lavadero</label>
            <input type="number" className="bg-transparent w-full text-5xl font-black outline-none text-center text-green-400" value={datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
          </div>
        )}

        <button type="submit" className={`w-full p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all ${modo === 'piso' ? 'bg-blue-600' : 'bg-green-600'}`}>
          Confirmar Registro
        </button>
      </form>

      {/* MANIFIESTO DE GUARDIA EN TIEMPO REAL */}
      {registrosSesion.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center px-2 mb-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Registros de esta Guardia</h3>
            <button onClick={descargarReporte} className="text-[9px] bg-slate-800 text-blue-400 px-3 py-1.5 rounded-full font-black border border-blue-900/30 uppercase">Descargar .TXT</button>
          </div>
          
          <div className="space-y-2">
            {registrosSesion.map((reg, index) => (
              <div key={index} className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">{reg.item}</p>
                  <p className="text-[8px] text-slate-500 font-mono italic">{reg.hora} hs</p>
                </div>
                <div className="text-right">
                  {reg.entregado_limpio > 0 && <span className="text-green-500 font-black text-xs">+{reg.entregado_limpio} L </span>}
                  {reg.retirado_sucio > 0 && <span className="text-red-500 font-black text-xs">-{reg.retirado_sucio} S</span>}
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