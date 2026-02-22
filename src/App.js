import React, { useState } from 'react';
import Login from './components/Login';
import FormularioPiso from './components/FormularioPiso';
import HistorialMovimientos from './components/HistorialMovimientos'; // Importamos el nuevo componente

function App() {
  const [pañoleroLogueado, setPañoleroLogueado] = useState(null);
  const [vistaActual, setVistaActual] = useState('formulario'); // Estado para controlar qué pantalla ver

  return (
    <div className="App bg-slate-950 min-h-screen">
      {!pañoleroLogueado ? (
        <Login alLoguear={(dni) => setPañoleroLogueado(dni)} />
      ) : (
        <>
          {/* Barra de Navegación Simple */}
          <nav className="flex justify-around bg-slate-900 p-4 border-b border-slate-800 shadow-xl">
            <button 
              onClick={() => setVistaActual('formulario')}
              className={`text-[10px] font-black uppercase tracking-widest ${vistaActual === 'formulario' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}
            >
              Registrar Carga
            </button>
            <button 
              onClick={() => setVistaActual('historial')}
              className={`text-[10px] font-black uppercase tracking-widest ${vistaActual === 'historial' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}
            >
              Ver Historial
            </button>
          </nav>

          {/* Renderizado condicional de vistas */}
          {vistaActual === 'formulario' ? (
            <FormularioPiso 
              nroPiso={1} 
              dniPañolero={pañoleroLogueado} 
            />
          ) : (
            <HistorialMovimientos />
          )}

          {/* Botón para cerrar sesión al final de la página */}
          <div className="p-4 text-center">
             <button 
               onClick={() => setPañoleroLogueado(null)}
               className="text-[10px] text-red-900 font-bold uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity"
             >
               Cerrar Sesión
             </button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;