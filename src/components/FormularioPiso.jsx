import React, { useState } from 'react';

const DB_PERSONAL = [
  { dni: "22976371", nombre: "Suboficial Primero Moreno", cargo: "Enfermería Piso 1" },
  { dni: "87654321", nombre: "Cabo Principal Quiroga", cargo: "Enfermería Piso 1" },
  { dni: "11223344", nombre: "Teniente de Navío García", cargo: "Jefe de Guardia" },
  { dni: "20334455", nombre: "Agente Gómez", cargo: "Pañolero Turno Mañana" }, // Ejemplo de Pañolero
];

const FormularioPiso = ({ nroPiso, dniPañolero }) => {
  // Estado estructurado para múltiples insumos
  const [datos, setDatos] = useState({
    dniEnfermero: '',
    insumos: {
      sabanas: { entregado: 0, sucio: 0, queda: 0 },
      toallas: { entregado: 0, sucio: 0, queda: 0 },
      toallones: { entregado: 0, sucio: 0, queda: 0 }
    },
    motivoFaltante: ''
  });

  // Función para actualizar valores específicos de un insumo
  const actualizarStock = (tipo, campo, valor) => {
    setDatos(prev => ({
      ...prev,
      insumos: {
        ...prev.insumos,
        [tipo]: { ...prev.insumos[tipo], [campo]: Math.max(0, valor) }
      }
    }));
  };

  // Verificamos si hay discrepancias en CUALQUIERA de los insumos
  const hayDiscrepancia = Object.values(datos.insumos).some(
    insumo => insumo.entregado !== (insumo.sucio + insumo.queda)
  );

  const responsableEncontrado = DB_PERSONAL.find(p => p.dni === datos.dniEnfermero);
  const nombrePañolero = DB_PERSONAL.find(p => p.dni === dniPañolero)?.nombre || "Usuario Desconocido";

  const handleFinalizar = () => {
    if (!datos.dniEnfermero) return alert("Error: Ingrese DNI del responsable de piso.");
    if (hayDiscrepancia && !datos.motivoFaltante) return alert("Error: Justifique la discrepancia de stock.");
    
    console.log("Registro de Salida - Pañolero:", dniPañolero, "Piso:", nroPiso, datos);
    alert(`Registro Exitoso para el Piso ${nroPiso}. Operador: ${nombrePañolero}`);
  };

  // Componente interno para las filas de insumos
  const SeccionInsumo = ({ titulo, tipo, valores }) => (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-xl mb-4 overflow-hidden">
      <div className="bg-slate-700/50 px-4 py-2 border-b border-slate-600">
        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-300">{titulo}</h3>
      </div>
      <div className="p-4 space-y-4">
        {[
          { label: 'Entrega (Limpio)', campo: 'entregado', color: 'text-blue-400' },
          { label: 'Recojo (Sucio)', campo: 'sucio', color: 'text-red-400' },
          { label: 'Queda en Piso', campo: 'queda', color: 'text-yellow-500' }
        ].map((item) => (
          <div key={item.campo} className="flex justify-between items-center">
            <span className={`text-[11px] font-bold uppercase ${item.color}`}>{item.label}</span>
            <div className="flex items-center bg-slate-900 rounded-lg border border-slate-700 p-1">
              <button onClick={() => actualizarStock(tipo, item.campo, valores[item.campo] - 1)} className="w-8 h-8 font-bold">-</button>
              <span className="w-10 text-center font-mono">{valores[item.campo]}</span>
              <button onClick={() => actualizarStock(tipo, item.campo, valores[item.campo] + 1)} className="w-8 h-8 font-bold">+</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 font-sans pb-10">
      <header className="border-b-2 border-blue-500 pb-4 mb-6">
        <h1 className="text-2xl font-black text-blue-400 tracking-tighter">HNPM <span className="text-slate-100">HOTELERIA</span></h1>
        <div className="flex justify-between items-center mt-2 text-[10px] font-mono text-slate-400">
          <span>OPERADOR: {nombrePañolero}</span>
          <span className="bg-slate-800 px-2 py-1 rounded border border-slate-700 text-blue-400">PAÑOL PISO {nroPiso}</span>
        </div>
      </header>

      {/* Identificación del Enfermero */}
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6 shadow-lg">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Responsable de Guardia (DNI)</label>
        <input 
          type="number" 
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="DNI del Enfermero..."
          onChange={(e) => setDatos({...datos, dniEnfermero: e.target.value})}
        />
        {responsableEncontrado && (
          <div className="mt-3 p-2 bg-blue-900/20 border border-blue-500/50 rounded text-xs">
            <p className="text-blue-400 font-bold uppercase">Personal: {responsableEncontrado.nombre}</p>
          </div>
        )}
      </div>

      {/* Secciones de Insumos */}
      <SeccionInsumo titulo="Sábanas" tipo="sabanas" valores={datos.insumos.sabanas} />
      <SeccionInsumo titulo="Toallas" tipo="toallas" valores={datos.insumos.toallas} />
      <SeccionInsumo titulo="Toallones" tipo="toallones" valores={datos.insumos.toallones} />

      {/* Alerta de Discrepancia */}
      {hayDiscrepancia && (
        <div className="bg-red-950/40 border-2 border-red-500 p-4 rounded-xl mb-6 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
          <h3 className="text-red-400 font-bold text-xs uppercase mb-2">⚠️ Discrepancia en conteo detectada</h3>
          <select 
            className="w-full bg-slate-900 border border-red-500 rounded-lg p-3 text-sm text-white outline-none"
            value={datos.motivoFaltante}
            onChange={(e) => setDatos({...datos, motivoFaltante: e.target.value})}
          >
            <option value="">Justificar faltante...</option>
            <option value="traslado">Traslado con paciente</option>
            <option value="obito">Óbito / Morgue</option>
            <option value="descarte">Ropa Dañada</option>
            <option value="desvio">Sin justificar</option>
          </select>
        </div>
      )}

      <button 
        onClick={handleFinalizar}
        className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all uppercase"
      >
        Registrar Cargo de Piso {nroPiso}
      </button>

      <footer className="mt-8 text-center opacity-20 text-[8px] tracking-[3px] uppercase">
        Sentinel AI Security Hub - v1.0
      </footer>
    </div>
  );
};

export default FormularioPiso;