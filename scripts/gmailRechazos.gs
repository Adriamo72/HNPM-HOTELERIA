const CONFIG = {
  sourceLabel: 'rechazos-hotel',
  processedLabel: 'rechazos-hotel/procesado',
  functionUrl: 'PEGAR_URL_EDGE_FUNCTION_AQUI',
  webhookToken: 'PEGAR_TOKEN_AQUI',
  maxThreadsPerRun: 20,
};

function procesarRechazosGmail() {
  const sourceLabel = obtenerOCrearLabel_(CONFIG.sourceLabel);
  const processedLabel = obtenerOCrearLabel_(CONFIG.processedLabel);
  const query = `label:${CONFIG.sourceLabel} -label:${CONFIG.processedLabel}`;
  const threads = GmailApp.search(query, 0, CONFIG.maxThreadsPerRun);

  threads.forEach((thread) => {
    const messages = thread.getMessages();

    messages.forEach((message) => {
      const body = limpiarTexto_(message.getPlainBody() || message.getBody() || '');
      const payload = construirPayload_(message, body);

      const response = UrlFetchApp.fetch(CONFIG.functionUrl, {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: `Bearer ${CONFIG.webhookToken}`,
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const status = response.getResponseCode();
      if (status < 200 || status >= 300) {
        throw new Error(`Webhook respondió ${status}: ${response.getContentText()}`);
      }
    });

    thread.addLabel(processedLabel);
    thread.markRead();
    if (sourceLabel.getName() !== processedLabel.getName()) {
      thread.removeLabel(sourceLabel);
    }
  });
}

function construirPayload_(message, body) {
  const paciente = extraerDato_(body, ['Paciente']);
  const partesPaciente = paciente.split(/\s+/).filter(Boolean);
  const apellido = partesPaciente.length ? partesPaciente[0] : '';
  const nombre = partesPaciente.length > 1 ? partesPaciente.slice(1).join(' ') : '';

  return {
    gmailMessageId: message.getId(),
    from: extraerEmail_(message.getFrom()),
    subject: message.getSubject(),
    body,
    pacienteApellido: apellido,
    pacienteNombre: nombre,
    responsableMi: extraerDato_(body, ['Responsable M.I', 'Responsable MI', 'Responsable']),
    obraSocial: extraerDato_(body, ['OOSS', 'Obra social']),
    motivo: extraerDato_(body, ['Motivo', 'Causa']),
    diagnostico: extraerDato_(body, ['Diagnostico', 'Diagnóstico']),
    fechaRechazo: message.getDate().toISOString(),
    metadata: {
      threadId: message.getThread().getId(),
      label: CONFIG.sourceLabel,
    },
  };
}

function extraerDato_(texto, etiquetas) {
  if (!texto) return '';

  for (const etiqueta of etiquetas) {
    const escaped = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}\\s*:\\s*(.*?)(?=,\\s*[A-ZÁÉÍÓÚÑ. ]+\\s*:|$)`, 'i');
    const match = texto.match(regex);
    if (match && match[1]) return match[1].trim();
  }

  return '';
}

function limpiarTexto_(texto) {
  return texto
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extraerEmail_(fromText) {
  const match = fromText.match(/<([^>]+)>/);
  return match ? match[1] : fromText;
}

function obtenerOCrearLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}