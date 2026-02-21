import React, { useState } from 'react';
import Login from './components/Login';
import FormularioPiso from './components/FormularioPiso';

function App() {
  const [pañoleroLogueado, setPañoleroLogueado] = useState(null);

  // Ahora sí vamos a usar esta función para limpiar el estado
  const cerrarSesion = () => {
    setPañoleroLogueado(null);
  };

  return (
    <div className="App bg-slate-950 min-h-screen text-slate-100 font-sans">
      {!pañoleroLogueado ? (
        // Si no hay nadie, mostramos el Login
        <Login alLoguear={(dni) => setPañoleroLogueado(dni)} />
      ) : (
        <div className="relative">
          {/* BOTÓN DE SALIDA: Con esto el error de Vercel desaparece */}
          <div className="absolute top-4 right-4 z-50">
            <button 
              onClick={cerrarSesion}
              className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/50 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg active:scale-95"
            >
              Finalizar Turno
            </button>
          </div>
          
          {/* El Formulario del Piso */}
          <FormularioPiso 
            nroPiso={1} 
            dniPañolero={pañoleroLogueado} 
          />
        </div>
      )}
    </div>
  );
}

export default App;