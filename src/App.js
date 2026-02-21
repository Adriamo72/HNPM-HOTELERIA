import React, { useState } from 'react';
import Login from './components/Login';
import FormularioPiso from './components/FormularioPiso';

function App() {
  const [pañoleroLogueado, setPañoleroLogueado] = useState(null);

  // Función para cerrar sesión si se desea más tarde
  const cerrarSesion = () => setPañoleroLogueado(null);

  return (
    <div className="App bg-slate-950 min-h-screen">
      {!pañoleroLogueado ? (
        // Si no hay nadie logueado, mostramos el Login
        <Login alLoguear={(dni) => setPañoleroLogueado(dni)} />
      ) : (
        // Si ya ingresó el DNI, mostramos el formulario del piso
        // Aquí es donde el QR en el futuro pasaría el "nroPiso"
        <FormularioPiso 
          nroPiso={1} 
          dniPañolero={pañoleroLogueado} 
        />
      )}
    </div>
  );
}

export default App;