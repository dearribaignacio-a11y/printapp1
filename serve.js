/* Servidor del panel: sirve los archivos estaticos y expone
   POST /api/interpretar, que es lo unico que habla con la API de Claude.
   La clave sale de la variable de entorno ANTHROPIC_API_KEY y nunca
   viaja al navegador.

   Arranque:  node serve.js     (o npm start) */

const http = require('http'), fs = require('fs'), path = require('path');
const { MODELO, INSTRUCCIONES, HERRAMIENTA } = require('./interpretador');

const ROOT  = __dirname;
const PORT  = process.env.PORT || 5173;
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

/* El SDK es opcional: sin el (o sin clave) el panel sigue andando y el
   chat avisa que esta interpretando en modo local. */
let Anthropic = null, faltaSdk = null;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (e) {
  faltaSdk = 'El SDK no esta instalado: corre npm install.';
}

let cliente = null;
function obtenerCliente() {
  if (cliente) return cliente;
  if (!Anthropic) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  cliente = new Anthropic();
  return cliente;
}

function json(res, codigo, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(texto);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', c => {
      datos += c;
      if (datos.length > 12e6) { reject(new Error('Mensaje demasiado grande')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(datos || '{}')); } catch (e) { reject(e); }
    });
  });
}

/* Arma el turno del usuario: catalogo + mensaje + foto si la hay. */
function contenidoUsuario({ texto, imagen, correccion, catalogo }) {
  const bloques = [];

  if (imagen && imagen.data) {
    bloques.push({
      type: 'image',
      source: { type: 'base64', media_type: imagen.mediaType || 'image/jpeg', data: imagen.data }
    });
  }

  const partes = [
    'Catalogo actual (id | nombre | costo | precio | unidad):',
    (catalogo || []).map(p =>
      `${p.id} | ${p.nombre} | ${p.costo} | ${p.precio} | ${p.unidad}`).join('\n')
  ];

  if (correccion && correccion.linea) {
    partes.push(
      '',
      'El comerciante esta CORRIGIENDO este renglon que ya le mostraste:',
      JSON.stringify(correccion.linea),
      'Cambia unicamente el dato que aclara abajo y deja el resto igual.'
    );
  }

  partes.push('', 'Mensaje del comerciante:', texto || '(mando una foto sin texto)');
  bloques.push({ type: 'text', text: partes.join('\n') });

  return bloques;
}

async function interpretar(cuerpo) {
  const client = obtenerCliente();
  if (!client) {
    return { ok: false, motivo: faltaSdk || 'Falta configurar ANTHROPIC_API_KEY en el servidor.' };
  }

  const respuesta = await client.messages.create({
    model: MODELO,
    max_tokens: 16000,
    system: INSTRUCCIONES,
    tools: [HERRAMIENTA],
    messages: [{ role: 'user', content: contenidoUsuario(cuerpo) }]
  });

  if (respuesta.stop_reason === 'refusal') {
    return { ok: false, motivo: 'El modelo no pudo procesar ese mensaje.' };
  }

  const llamada = respuesta.content.find(b => b.type === 'tool_use');
  if (llamada) return { ok: true, propuesta: llamada.input, motor: 'claude' };

  /* Sin herramienta: se muestra lo que dijo como pregunta, sin asumir nada. */
  const texto = respuesta.content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
  return {
    ok: true,
    motor: 'claude',
    propuesta: { tipo: 'pregunta', mensaje: texto || 'No entendi el mensaje. Podes repetirlo?', lineas: [] }
  };
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.split('?')[0].replace(/^\//, '') === 'api/interpretar') {
    try {
      const cuerpo = await leerCuerpo(req);
      json(res, 200, await interpretar(cuerpo));
    } catch (e) {
      console.error('interpretar:', e.message);
      json(res, 200, { ok: false, motivo: 'Error al consultar el modelo: ' + e.message });
    }
    return;
  }

  let f = decodeURIComponent(req.url.split('?')[0]);
  if (f.endsWith('/')) f += 'index.html';   /* '/' y '/test/' */

  const full = path.resolve(ROOT, '.' + f);
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('Prohibido'); }

  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': (TIPOS[path.extname(full)] || 'text/plain') + '; charset=utf-8' });
    res.end(data);
  });
}).listen(PORT, () => {
  const estado = obtenerCliente() ? 'modelo conectado' : 'sin modelo (interpretacion local)';
  console.log('Panel en http://localhost:' + PORT + ' · ' + estado);
});
