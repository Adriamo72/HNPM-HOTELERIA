import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ITEMS_HOTELERIA = [
  'SABANAS', 'TOALLA', 'TOALLON', 'FRAZADAS', 
  'SALEA HULE', 'SALEA TELA', 'FUNDAS', 'CUBRECAMAS'
];

const FormularioPiso = ({ dniPañolero, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [enfermeros, setEnfermeros] = useState([]);
  const [datos, setDatos] = useState({
    item: 'SABANAS',
    entregado_limpio: 0,
    retirado_sucio: 0,
    stock_fisico_piso: 0,
    dni_enfermero: '',
    comentarios: ''
  });

  useEffect(() => {
    cargarContexto();
  }, [slugPiso]);

  const cargarContexto = async () => {
    // 1. Obtener datos del piso por el slug del QR
    const { data: dataPiso } = await supabase.from('pisos').select('*').eq('slug', slugPiso).single();
    setPiso(dataPiso);

    // 2. Obtener lista de enfermeros para el responsable
    const { data: dataEnf } = await supabase.from('personal').select('*').eq('rol', 'enfermero').order('apellido');
    setEnfermeros(dataEnf || []);
  };

  const enviarRegistro = async (e) => {
    e.preventDefault();
    if (!datos.dni_enfermero) return alert("Debe seleccionar al Enfermero Responsable");

    const { error } = await supabase.from('movimientos_stock').insert([{
      piso_id: piso.id,
      dni_pañolero: dniPañolero,
      dni_enfermero: datos.dni_enfermero,
      item: datos.item,
      entregado_limpio: parseInt(datos.entregado_limpio),
      retirado_sucio: parseInt(datos.retirado_sucio),
      stock_fisico_piso: parseInt(datos.stock_fisico_piso),
      comentarios: datos.comentarios
    }]);

    if (error) alert("Error al registrar: " + error.message);
    else {
      alert("Registro de " + datos.item + " completado");
      setDatos({ ...datos, entregado_limpio: 0, retirado_sucio: 0, stock_fisico_piso: 0, comentarios: '' });
    }
  };

  if (!piso) return <div className="p-10 text-white animate-pulse uppercase tracking-widest text-xs">Escaneando punto de control...</div>;

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-slate-200">
      <div className="mb-6">
        <h2 className="text-xl font-black text-blue-500 uppercase italic">{piso.nombre_piso}</h2>
        <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Registro de Movimiento de Activos</p>
      </div>

      <form onSubmit={enviarRegistro} className="space-y-4 bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl">
        {/* Selección de Ítem */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Tipo de Prenda</label>
          <select 
            className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 font-bold text-blue-300"
            value={datos.item}
            onChange={e => setDatos({...datos, item: e.target.value})}
          >
            {ITEMS_HOTELERIA.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {/* Selección de Enfermero */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Enfermero Responsable (Recibe)</label>
          <select 
            className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm"
            value={datos.dni_enfermero}
            onChange={e => setDatos({...datos, dni_enfermero: e.target.value})}
            required
          >
            <option value="">Seleccionar responsable...</option>
            {enfermeros.map(enf => (
              <option key={enf.dni} value={enf.dni}>{enf.jerarquia} {enf.apellido}, {enf.nombre}</option>
            ))}
          </select>
        </div>

        {/* Cantidades */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <label className="text-[9px] font-black text-green-600 uppercase mb-1 block">Entrego Limpio</label>
            <input type="number" className="bg-transparent w-full text-xl font-black outline-none" value={datos.entregado_limpio} onChange={e => setDatos({...datos, entregado_limpio: e.target.value})} />
          </div>
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <label className="text-[9px] font-black text-red-600 uppercase mb-1 block">Retiro Sucio</label>
            <input type="number" className="bg-transparent w-full text-xl font-black outline-none" value={datos.retirado_sucio} onChange={e => setDatos({...datos, retirado_sucio: e.target.value})} />
          </div>
        </div>

        {/* Stock Remanente */}
        <div className="bg-blue-900/10 p-3 rounded-2xl border border-blue-900/30">
          <label className="text-[9px] font-black text-blue-400 uppercase mb-1 block">Stock Físico en Estante (Post-entrega)</label>
          <input type="number" className="bg-transparent w-full text-xl font-black outline-none text-blue-200" value={datos.stock_fisico_piso} onChange={e => setDatos({...datos, stock_fisico_piso: e.target.value})} />
        </div>

        <textarea 
          className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm h-20" 
          placeholder="Observaciones (Ej: 1 sábana rota, traslado, etc.)"
          value={datos.comentarios}
          onChange={e => setDatos({...datos, comentarios: e.target.value})}
        ></textarea>

        <button type="submit" className="w-full bg-blue-600 p-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-blue-900/40 active:scale-95 transition-all">
          Confirmar Movimiento
        </button>
      </form>
    </div>
  );
};

export default FormularioPiso;