// En AdminDashboard.jsx, agregar esta función
const generarQRPersonal = async (personal) => {
  try {
    // Generar token único
    const token = crypto.randomUUID ? crypto.randomUUID() : 
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Expira en 6 meses
    const expiraEn = new Date();
    expiraEn.setMonth(expiraEn.getMonth() + 6);
    
    // Desactivar tokens anteriores del mismo usuario
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
      console.error("Error:", error);
      mostrarSplash("❌ Error al generar QR");
      return;
    }
    
    const qrUrl = `${window.location.origin}/auth/${token}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrUrl)}`;
    
    // Abrir ventana para imprimir credencial
    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Credencial ${personal.apellido}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: system-ui, -apple-system, 'Segoe UI', monospace;
              background: #0f172a;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              padding: 20px;
            }
            .credencial {
              background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
              border-radius: 24px;
              padding: 24px;
              width: 380px;
              text-align: center;
              box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
              border: 1px solid #3b82f6;
            }
            .header {
              border-bottom: 2px solid #3b82f6;
              padding-bottom: 16px;
              margin-bottom: 20px;
            }
            .header h2 {
              color: #3b82f6;
              font-size: 12px;
              letter-spacing: 3px;
              font-weight: 900;
              text-transform: uppercase;
            }
            .header h1 {
              color: white;
              font-size: 16px;
              margin-top: 4px;
            }
            .qr {
              background: white;
              padding: 20px;
              border-radius: 20px;
              margin: 20px 0;
              display: inline-block;
            }
            .qr img {
              width: 220px;
              height: 220px;
            }
            .nombre {
              color: white;
              font-size: 18px;
              font-weight: bold;
              margin: 15px 0 5px;
            }
            .jerarquia {
              color: #3b82f6;
              font-size: 12px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .info {
              margin-top: 20px;
              padding-top: 16px;
              border-top: 1px solid #334155;
              font-size: 10px;
              color: #64748b;
            }
            .badge {
              background: #3b82f6;
              color: white;
              padding: 4px 12px;
              border-radius: 20px;
              font-size: 10px;
              font-weight: bold;
              display: inline-block;
              margin-top: 10px;
            }
            @media print {
              body { background: white; padding: 0; }
              .credencial { box-shadow: none; border: 1px solid #ccc; background: white; }
              .header h1 { color: black; }
              .nombre { color: black; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="credencial">
            <div class="header">
              <h2>HOSPITAL NACIONAL</h2>
              <h1>DEPARTAMENTO HOTELERÍA</h1>
            </div>
            <div class="qr">
              <img src="${qrCodeUrl}" alt="QR de acceso" />
            </div>
            <div class="nombre">
              ${personal.apellido}, ${personal.nombre}
            </div>
            <div class="jerarquia">
              ${personal.jerarquia || 'OPERADOR'}
            </div>
            <div class="badge">
              ${personal.rol?.toUpperCase() || 'PAÑOLERO'}
            </div>
            <div class="info">
              <p>🔐 Escanea este QR para acceder al sistema</p>
              <p>📅 Válido hasta: ${expiraEn.toLocaleDateString('es-AR')}</p>
              <p>⚠️ Personal e intransferible</p>
            </div>
          </div>
          <script>
            setTimeout(() => {
              window.print();
              setTimeout(() => window.close(), 2000);
            }, 500);
          </script>
        </body>
      </html>
    `);
    win.document.close();
    
    mostrarSplash(`✅ Credencial generada para ${personal.apellido}`);
    
  } catch (error) {
    console.error("Error:", error);
    mostrarSplash("❌ Error al generar credencial");
  }
};