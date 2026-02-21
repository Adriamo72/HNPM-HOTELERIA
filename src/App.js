import React, { useState } from 'react';
import Login from './components/Login';
import FormularioPiso from './components/FormularioPiso';

function App() {
  const [pañoleroLogueado, setPañoleroLogueado] = useState(null);

  // Ahora sí la vamos a usar con un botón más adelante
  const cerrarSesion = () => setPañoleroLogueado(null);

  return (
    <div className="App bg-slate-950 min-h-screen">
      {!pañoleroLogueado ? (
        <Login alLoguear={(dni) => setPañoleroLogueado(dni)} />
      ) : (
        <div className="relative">
          {/* Botón de salida para el pañolero */}
          <button 
            onClick={cerrarSesion}
            className="absolute top-4 right-4 z-50 bg-red-600/20 text-red-400 border border-red-500/50 px-3 py-1 rounded-lg text-[10px] font-bold uppercase hover:bg-red-600 hover:text-white transition-all"
          >
            Salir
          </button>
          
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