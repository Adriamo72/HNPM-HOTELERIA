import React, { useState } from 'react';
import Login from './components/Login';
import FormularioPiso from './components/FormularioPiso';

function App() {
  const [pañoleroLogueado, setPañoleroLogueado] = useState(null);

  // BORRAMOS cerrarSesion para que Vercel no tenga nada de qué quejarse
  return (
    <div className="App bg-slate-950 min-h-screen">
      {!pañoleroLogueado ? (
        <Login alLoguear={(dni) => setPañoleroLogueado(dni)} />
      ) : (
        <FormularioPiso 
          nroPiso={1} 
          dniPañolero={pañoleroLogueado} 
        />
      )}
    </div>
  );
}

export default App;