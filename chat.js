/* =============================================================
   Asistente: registrar ventas y compras dictando, escribiendo
   o sacandole una foto a la factura.

   Regla de oro: nada toca el stock ni las ventas sin que el
   comercio toque el boton de confirmar.
   ============================================================= */

const CHAT_KEY = 'print.chat.v1';

const CHAT = {
  mensajes: [],          // historial completo, se guarda como registro
  enviando: false,
  corrigiendo: null,     // { mensajeId, indice } mientras se corrige una linea
  imagen: null,          // { dataUrl, mediaType } de la foto todavia sin enviar
  grabando: false,
  borrador: '',      // lo que quedo escrito sin enviar
  reconocimiento: null,
  motor: null            // 'claude' | 'local', segun responda el servidor
};

function cargarChat() {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (raw) CHAT.mensajes = JSON.parse(raw) || [];
  } catch (e) { /* sin persistencia: el historial vive solo en memoria */ }
}

function guardarChat() {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(CHAT.mensajes));
  } catch (e) { /* la miniatura puede no entrar: se descarta el guardado */ }
}

function nuevoMensaje(rol, texto, extra) {
  const m = Object.assign({
    id: 'M-' + (CHAT.mensajes.length + 1),
    rol,
    texto,
    hora: horaActual(),
    miniatura: null,
    propuesta: null
  }, extra || {});
  CHAT.mensajes.push(m);
  guardarChat();
  return m;
}

/* ---------- Emparejar texto libre con el catalogo ---------- */

function normalizar(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Puntaje simple por palabras en comun, para sugerir candidatos
   cuando el producto dictado no aparece tal cual en el catalogo. */
function puntaje(texto, producto) {
  const a = normalizar(texto).split(' ').filter(w => w.length > 2);
  const b = normalizar(producto.nombre + ' ' + producto.categoria).split(" ").filter(w => w.length > 2);
  if (!a.length) return 0;

  let aciertos = 0;
  a.forEach(w => {
    if (b.some(x => x === w || (w.length >= 4 && x.startsWith(w)) || (x.length >= 4 && w.startsWith(x)))) aciertos++;
  });
  return aciertos / a.length;
}

function candidatos(texto, cantidad = 3) {
  return PRODUCTOS
    .map(p => ({ producto: p, score: puntaje(texto, p) }))
    .filter(c => c.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, cantidad);
}

function buscarProducto(texto) {
  const c = candidatos(texto, 1)[0];
  return c && c.score >= 0.5 ? c.producto : null;
}

/* ---------- Numeros dictados en palabras ---------- */

const PALABRAS_NUM = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40,
  cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700,
  ochocientos: 800, novecientos: 900
};

/* "cinco mil" -> 5000, "doce" -> 12, "mil quinientos" -> 1500 */
function numeroDePalabras(tokens) {
  let total = 0, parcial = 0, hubo = false;

  tokens.forEach(t => {
    if (PALABRAS_NUM[t] !== undefined) { parcial += PALABRAS_NUM[t]; hubo = true; }
    else if (t === 'mil')     { parcial = (parcial || 1) * 1000; total += parcial; parcial = 0; hubo = true; }
    else if (t === 'millon' || t === 'millones') { parcial = (parcial || 1) * 1000000; total += parcial; parcial = 0; hubo = true; }
    else if (t !== 'y') { total += parcial; parcial = 0; }
  });

  return hubo ? total + parcial : null;
}

/* ---------- Interprete local (cuando no hay API configurada) ----------
   Entiende frases simples dictadas o escritas. Devuelve exactamente el
   mismo formato que el modelo, asi el resto de la pantalla no cambia. */

function prepararTexto(t) {
  let s = String(t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\$/g, ' simbolopeso ');
  s = s.replace(/([0-9])[.,]([0-9]{3})\b/g, '$1$2');
  s = s.replace(/([0-9])[.,]([0-9]{3})\b/g, '$1$2');
  return s.replace(/([0-9]),([0-9]{1,2})\b/g, '$1.$2')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Un numero es plata si viene precedido por una marca de monto o seguido
   por "pesos". Mirar mas lejos hace que "doce cuadernos, total ..." tome
   el doce como si fuera plata. */
const MARCAS_MONTO  = ['simbolopeso', 'total', 'sale', 'salen', 'son', 'cuesta', 'cobre', 'cobra', 'por', 'a'];
const MARCAS_UNIDAD  = ['cada', 'cu', 'unidad', 'unitario', 'c'];
const PALABRAS_VERBO = ['vendi', 'vender', 'vendio', 'venta', 'vendimos', 'compre', 'comprar', 'compra',
                        'factura', 'proveedor', 'distribuidor', 'total', 'pesos', 'peso', 'simbolopeso',
                        'cada', 'unidad', 'unitario', 'de', 'a', 'la', 'el', 'los', 'las', 'un', 'una',
                        'por', 'con', 'y', 'me', 'se', 'al'];

function numerosConContexto(tokens) {
  const nums = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    let valor = null, hasta = i;

    if (/^\d+(\.\d+)?$/.test(tk)) {
      valor = parseFloat(tk);
    } else if (PALABRAS_NUM[tk] !== undefined || tk === 'mil') {
      let j = i;
      const grupo = [];
      while (j < tokens.length &&
            (PALABRAS_NUM[tokens[j]] !== undefined || tokens[j] === 'mil' ||
             tokens[j] === 'millon' || tokens[j] === 'millones' || tokens[j] === 'y')) {
        grupo.push(tokens[j]); j++;
      }
      valor = numeroDePalabras(grupo);
      hasta = j - 1;
    }

    if (valor === null) continue;

    const anterior = tokens[i - 1];
    const sigue    = tokens.slice(hasta + 1, hasta + 3);


    nums.push({
      valor,
      esMonto:  MARCAS_MONTO.includes(anterior) || sigue.some(w => w === 'pesos' || w === 'peso'),
      /* "6 sellos a 6800" es precio por unidad; "6 sellos por 6800" es el total. */
      esUnidad: anterior === 'a' || sigue.some(w => MARCAS_UNIDAD.includes(w)) || MARCAS_UNIDAD.includes(anterior),
      desde: i, hasta
    });
    i = hasta;
  }
  return nums;
}

function interpretarLocal(texto) {
  const plano  = prepararTexto(texto);
  const tokens = plano.split(' ').filter(Boolean);
  const tipo   = /compr|factur|proveedor|distribuidor|repuse|repusimos/.test(plano) ? 'compra' : 'venta';

  const nums   = numerosConContexto(tokens);
  const montos = nums.filter(n => n.esMonto);
  const sueltos = nums.filter(n => !n.esMonto);

  /* El texto del producto es lo que queda al sacar numeros y muletillas. */
  const usados = new Set();
  nums.forEach(n => { for (let k = n.desde; k <= n.hasta; k++) usados.add(k); });
  const textoProducto = tokens
    .filter((tk, i) => !usados.has(i) && !PALABRAS_VERBO.includes(tk))
    .join(' ');

  const producto = buscarProducto(textoProducto);
  const cantidad = sueltos.length ? sueltos[0].valor : 1;

  let unitario = null, total = null;
  montos.forEach(m => { if (m.esUnidad) unitario = m.valor; else total = m.valor; });
  if (unitario === null && total !== null && cantidad) unitario = total / cantidad;
  if (total === null && unitario !== null) total = unitario * cantidad;

  if (!producto) {
    const sugeridos = candidatos(textoProducto, 2);
    return {
      tipo: 'pregunta',
      mensaje: sugeridos.length
        ? 'No encontre "' + textoProducto + '" en el catalogo. Elegi el producto correcto y lo cargo.'
        : 'No pude identificar el producto. Decime el nombre como figura en el catalogo.',
      lineas: [{
        productoId: null,
        textoDetectado: textoProducto || texto,
        cantidad,
        unitario,
        total,
        duda: sugeridos.length ? 'Se parece a: ' + sugeridos.map(c => c.producto.nombre).join(' o ') : null
      }]
    };
  }

  if (unitario === null) {
    unitario = tipo === 'compra' ? producto.costo : producto.precio;
    total = unitario * cantidad;
  }

  return {
    tipo,
    mensaje: 'Interpretado sin conexion con el modelo. Revisa los numeros antes de confirmar.',
    lineas: [{
      productoId: producto.id,
      textoDetectado: textoProducto,
      cantidad,
      unitario,
      total,
      duda: null
    }]
  };
}

/* ---------- Puente con el modelo ---------- */

function catalogoParaModelo() {
  return PRODUCTOS.map(p => ({
    id: p.id, nombre: p.nombre, categoria: p.categoria,
    costo: p.costo, precio: p.precio, unidad: p.unidad
  }));
}

/* Publicado como sitio estatico no hay endpoint: la respuesta puede ser
   cualquier cosa, incluso un 404 que se parsea como JSON. Por eso se
   mira el estado HTTP antes que el cuerpo. */
const SIN_SERVIDOR = 'El panel está publicado sin servidor propio, así que no hay modelo detrás. ' +
                     'Interpreto el texto acá mismo y no puedo leer fotos.';

async function interpretar({ texto, imagen, correccion }) {
  try {
    const res = await fetch('api/interpretar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto,
        imagen: imagen ? { data: imagen.base64, mediaType: imagen.mediaType } : null,
        correccion: correccion || null,
        catalogo: catalogoParaModelo()
      })
    });

    if (!res.ok) return sinModelo(texto, imagen, SIN_SERVIDOR);

    const data = await res.json();
    if (data && data.ok && data.propuesta) {
      CHAT.motor = 'claude';
      return data.propuesta;
    }
    return sinModelo(texto, imagen, (data && data.motivo) || SIN_SERVIDOR);
  } catch (e) {
    return sinModelo(texto, imagen, SIN_SERVIDOR);
  }
}

/* El modelo no esta disponible: el texto se interpreta localmente y la
   foto no se puede leer, asi que se avisa en lugar de inventar. */
function sinModelo(texto, imagen, motivo) {
  CHAT.motor = 'local';

  if (imagen) {
    return {
      tipo: 'otro',
      mensaje: 'Para leer la factura hace falta el modelo configurado. ' +
               (motivo || '') + ' Mientras tanto podes dictarme los renglones.',
      lineas: []
    };
  }

  const local = interpretarLocal(texto);
  local.aviso = motivo || null;
  return local;
}

/* ---------- Dictado por voz ---------- */

function soportaVoz() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function alternarDictado() {
  if (CHAT.grabando) { detenerDictado(); return; }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  const rec = new SR();
  rec.lang = 'es-AR';
  rec.interimResults = true;
  rec.continuous = false;

  let final = '';

  rec.onresult = ev => {
    let parcial = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) final += t; else parcial += t;
    }
    const campo = $('chat-texto');
    if (campo) campo.value = (final + parcial).trim();
  };

  rec.onerror = () => { CHAT.grabando = false; pintarBarra(); };
  rec.onend   = () => { CHAT.grabando = false; CHAT.reconocimiento = null; pintarBarra(); };

  CHAT.reconocimiento = rec;
  CHAT.grabando = true;
  pintarBarra();
  rec.start();
}

function detenerDictado() {
  if (CHAT.reconocimiento) CHAT.reconocimiento.stop();
  CHAT.grabando = false;
  pintarBarra();
}

/* ---------- Foto de factura ---------- */

/* Dos tamanios: uno chico para dejar asentado en el historial y otro
   mas grande, solo en memoria, para mandarle al modelo. */
function achicar(img, maxLado, calidad) {
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width  = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', calidad);
}

function leerFoto(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = reject;
    lector.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const grande = achicar(img, 1600, 0.8);
        resolve({
          base64: grande.split(',')[1],
          mediaType: 'image/jpeg',
          miniatura: achicar(img, 260, 0.6),
          nombre: file.name || 'factura'
        });
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(file);
  });
}

/* ---------- Vista ---------- */

function etiquetaTipo(tipo) {
  if (tipo === 'venta')  return '<span class="chip chip-info">Venta</span>';
  if (tipo === 'compra') return '<span class="chip chip-ok">Compra</span>';
  return '';
}

function fichaLinea(m, l, i) {
  const p = l.productoId ? productoPorId(l.productoId) : null;
  const esCompra = m.propuesta.tipo === 'compra';
  const unitario = typeof l.unitario === 'number' ? l.unitario : null;
  const total    = typeof l.total === 'number' ? l.total
                 : (unitario !== null ? unitario * l.cantidad : null);

  /* Producto sin identificar: se pregunta, no se asume. */
  if (!p) {
    const opciones = PRODUCTOS.map(x =>
      `<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
    return `
      <div class="ficha ficha-duda" data-msg="${m.id}" data-linea="${i}">
        <p class="ficha-duda-texto">
          <strong>${esc(l.textoDetectado || 'Producto sin identificar')}</strong>
          ${l.duda ? '<br><span class="muted">' + esc(l.duda) + '</span>' : ''}
        </p>
        <div class="ficha-acciones">
          <select class="chat-select" data-acc="elegir">
            <option value="">Elegir producto del catálogo…</option>
            ${opciones}
          </select>
        </div>
      </div>`;
  }

  const stockHoy = stock().find(s => s.producto.id === p.id);
  const queda    = stockHoy.actual + (esCompra ? l.cantidad : -l.cantidad);
  const ganancia = unitario !== null ? (unitario - p.costo) * l.cantidad : null;
  const excede   = !esCompra && l.cantidad > stockHoy.actual;
  const bajoCosto = !esCompra && unitario !== null && unitario < p.costo;

  const datos = [
    ['Cantidad', num(l.cantidad) + ' ' + esc(p.unidad)],
    [esCompra ? 'Costo unitario' : 'Precio unitario', unitario !== null ? money(unitario) : '—'],
    ['Total', total !== null ? money(total) : '—']
  ];
  if (!esCompra) {
    datos.push(['Ganancia', ganancia !== null
      ? '<span class="' + (ganancia < 0 ? 'neg' : 'pos') + '">' + money(ganancia) + '</span>' : '—']);
  }

  const acciones = l.estado === 'confirmada'
    ? `<p class="ficha-ok">Registrado como <strong>${esc(l.refId)}</strong> a las ${esc(l.horaRegistro)} ·
         ${esCompra ? 'sumado al' : 'descontado del'} stock</p>`
    : l.estado === 'descartada'
      ? `<p class="ficha-baja">Descartado, se reemplazó por la corrección</p>`
      : `<div class="ficha-acciones">
           <button class="btn-si" data-acc="confirmar">Sí, está bien</button>
           <button class="btn-no" data-acc="corregir">No, corregir</button>
         </div>`;

  return `
    <div class="ficha ${l.estado === 'confirmada' ? 'es-confirmada' : ''}" data-msg="${m.id}" data-linea="${i}">
      <div class="ficha-cab">
        <strong>${esc(p.nombre)}</strong>
        ${etiquetaTipo(m.propuesta.tipo)}
      </div>
      <dl class="ficha-datos">
        ${datos.map(([k, v]) => `<div><dt>${k}</dt><dd class="num">${v}</dd></div>`).join('')}
      </dl>
      ${l.estado === 'pendiente' ? `
        <p class="ficha-stock ${excede ? 'es-alerta' : ''}">
          Stock: <span class="num">${num(stockHoy.actual)}</span> →
          <span class="num">${num(queda)}</span> ${esc(p.unidad)}
          ${excede ? ' · la cantidad supera lo que hay en stock' : ''}
        </p>
        ${bajoCosto ? `<p class="ficha-stock es-alerta">
          El precio queda por debajo del costo (${money(p.costo)} por ${esc(p.unidad)})
        </p>` : ''}` : ''}
      ${acciones}
    </div>`;
}

function burbuja(m) {
  const fichas = m.propuesta && m.propuesta.lineas.length
    ? m.propuesta.lineas.map((l, i) => fichaLinea(m, l, i)).join('')
    : '';

  return `
    <div class="msg msg-${m.rol}">
      <div class="burbuja">
        ${m.miniatura ? `<img class="msg-foto" src="${m.miniatura}" alt="Factura adjuntada">` : ''}
        ${m.texto ? `<p>${esc(m.texto)}</p>` : ''}
        ${m.aviso ? `<p class="msg-aviso">${esc(m.aviso)}</p>` : ''}
      </div>
      ${fichas}
      <span class="msg-hora num">${esc(m.hora)}</span>
    </div>`;
}

function vistaAsistente() {
  const vacio = `
    <div class="chat-vacio">
      <p>Dictá o escribí lo que vendiste, o sacale una foto a una factura de compra.</p>
      <p class="muted">Ejemplo: “vendí doce cuadernos, total cinco mil pesos”.</p>
    </div>`;

  const hilo = CHAT.mensajes.length ? CHAT.mensajes.map(burbuja).join('') : vacio;

  const motor = CHAT.motor === 'claude'
    ? '<span class="chip chip-ok">Modelo conectado</span>'
    : CHAT.motor === 'local'
      ? '<span class="chip chip-warn">Sin modelo · lectura local</span>'
      : '<span class="chip chip-info">Sin usar todavía</span>';

  return `
    <section class="chat">
      <div class="chat-cab">
        ${motor}
        <p class="muted">Nada se registra hasta que lo confirmes. La conversación queda guardada como registro.</p>
      </div>

      <div class="chat-hilo" id="chat-hilo">
        ${hilo}
        ${CHAT.enviando ? '<div class="msg msg-asistente"><div class="burbuja pensando">Interpretando…</div></div>' : ''}
      </div>

      <div class="chat-barra">
        ${CHAT.imagen ? `
          <div class="chat-adjunto">
            <img src="${CHAT.imagen.miniatura}" alt="Factura por enviar">
            <span>${esc(CHAT.imagen.nombre)}</span>
            <button class="btn-quitar" id="btn-quitar-foto">Quitar</button>
          </div>` : ''}
        <div class="chat-entrada">
          <textarea id="chat-texto" rows="2" placeholder="${CHAT.corrigiendo
            ? 'Escribí solo el dato a corregir…'
            : 'Escribí o dictá lo que vendiste…'}">${esc(CHAT.borrador || '')}</textarea>
          <div class="chat-botones">
            <button class="btn-voz ${CHAT.grabando ? 'is-grabando' : ''}" id="btn-voz"
              ${soportaVoz() ? '' : 'disabled title="Este navegador no permite dictado por voz"'}>
              ${CHAT.grabando ? 'Detener' : 'Dictar'}
            </button>
            <label class="btn-foto" for="chat-foto">Foto</label>
            <input type="file" id="chat-foto" accept="image/*" capture="environment" hidden>
            <button class="btn-enviar" id="btn-enviar" ${CHAT.enviando ? 'disabled' : ''}>Enviar</button>
          </div>
        </div>
      </div>
    </section>`;
}

function pintarBarra() {
  const b = $('btn-voz');
  if (!b) return;
  b.classList.toggle('is-grabando', CHAT.grabando);
  b.textContent = CHAT.grabando ? 'Detener' : 'Dictar';
}

function alFinalDelHilo() {
  const h = $('chat-hilo');
  if (h) h.scrollTop = h.scrollHeight;
}

/* ---------- Acciones ---------- */

function fusionarCorreccion(base, nueva) {
  const l = Object.assign({}, base);
  if (nueva.productoId) l.productoId = nueva.productoId;
  if (typeof nueva.cantidad === 'number' && nueva.cantidad) l.cantidad = nueva.cantidad;
  if (typeof nueva.unitario === 'number') l.unitario = nueva.unitario;

  /* Los importes se rehacen: si aclaro el total, cambia el unitario; si
     cambio la cantidad, cambia el total. Arrastrarlos deja numeros que
     no cierran entre si. */
  if (typeof nueva.total === 'number') {
    l.total = nueva.total;
    if (typeof nueva.unitario !== 'number' && l.cantidad) l.unitario = l.total / l.cantidad;
  } else if (typeof l.unitario === 'number') {
    l.total = l.unitario * l.cantidad;
  }

  l.estado = 'pendiente';
  l.refId = null;
  return l;
}

async function enviarChat() {
  const campo = $('chat-texto');
  const texto = campo ? campo.value.trim() : '';
  if (CHAT.enviando) return;
  const imagen = CHAT.imagen;
  if (!texto && !imagen) return;

  const enCorreccion = CHAT.corrigiendo;
  let lineaBase = null;
  if (enCorreccion) {
    const mo = CHAT.mensajes.find(x => x.id === enCorreccion.mensajeId);
    lineaBase = mo && mo.propuesta ? mo.propuesta.lineas[enCorreccion.indice] : null;
  }

  const propio = nuevoMensaje('usuario', texto || 'Foto de factura de compra', {
    miniatura: imagen ? imagen.miniatura : null
  });

  if (campo) campo.value = '';
  CHAT.borrador = '';
  CHAT.imagen = null;
  CHAT.enviando = true;
  render();

  let propuesta;
  try {
    propuesta = await interpretar({
      texto,
      imagen,
      correccion: lineaBase ? { linea: lineaBase, aclaracion: texto } : null
    });
  } catch (e) {
    propuesta = { tipo: 'otro', mensaje: 'No pude interpretar el mensaje. Probá de nuevo.', lineas: [] };
  }

  CHAT.enviando = false;

  let lineas = (propuesta.lineas || []).map(l => Object.assign({}, l, {
    estado: 'pendiente', refId: null, horaRegistro: null
  }));

  /* Correccion en modo local: se cambia solo lo que el usuario aclaro. */
  if (lineaBase && CHAT.motor === 'local' && lineas.length) {
    lineas = [fusionarCorreccion(lineaBase, lineas[0])];
  }
  if (lineaBase) {
    const mo = CHAT.mensajes.find(x => x.id === enCorreccion.mensajeId);
    if (mo) mo.propuesta.lineas[enCorreccion.indice].estado = 'descartada';
    CHAT.corrigiendo = null;
  }

  nuevoMensaje('asistente', propuesta.mensaje, {
    aviso: propuesta.aviso || null,
    horaOrigen: propio.hora,
    propuesta: { tipo: propuesta.tipo, lineas }
  });

  render();
}

function confirmarLinea(mensajeId, indice) {
  const m = CHAT.mensajes.find(x => x.id === mensajeId);
  if (!m || !m.propuesta) return;

  const l = m.propuesta.lineas[indice];
  if (!l || l.estado !== 'pendiente' || !l.productoId) return;

  const p = productoPorId(l.productoId);
  const unitario = typeof l.unitario === 'number'
    ? l.unitario
    : (m.propuesta.tipo === 'compra' ? p.costo : p.precio);

  /* La hora que queda asentada es la del mensaje del comerciante. */
  const hora = m.horaOrigen || m.hora;

  const alta = m.propuesta.tipo === 'compra'
    ? registrarCompra({ productoId: l.productoId, cantidad: l.cantidad, costoUnitario: unitario, hora, mensajeId: m.id })
    : registrarVenta({ productoId: l.productoId, cantidad: l.cantidad, precioUnitario: unitario, hora, mensajeId: m.id });

  l.estado = 'confirmada';
  l.refId = alta.id;
  l.horaRegistro = hora;
  guardarChat();

  const pendientes = m.propuesta.lineas.filter(x => x.estado === 'pendiente').length;
  nuevoMensaje('asistente', pendientes
    ? 'Listo, registrado. Quedan ' + pendientes + ' renglones por confirmar.'
    : 'Listo, registrado.');

  render();
}

function corregirLinea(mensajeId, indice) {
  const m = CHAT.mensajes.find(x => x.id === mensajeId);
  if (!m || !m.propuesta) return;

  CHAT.corrigiendo = { mensajeId, indice };
  nuevoMensaje('asistente',
    'Decime qué está mal y lo corrijo: el producto, la cantidad o el monto. El resto queda como está.');
  render();

  const campo = $('chat-texto');
  if (campo) campo.focus();
}

function elegirProducto(mensajeId, indice, productoId) {
  const m = CHAT.mensajes.find(x => x.id === mensajeId);
  if (!m || !m.propuesta) return;

  const l = m.propuesta.lineas[indice];
  const p = productoPorId(productoId);
  if (!l || !p) return;

  l.productoId = p.id;
  if (typeof l.unitario !== 'number') {
    l.unitario = m.propuesta.tipo === 'compra' ? p.costo : p.precio;
    l.total = l.unitario * l.cantidad;
  }
  guardarChat();
  render();
}

function conectarAsistente() {
  const vista = $('view');

  const enviar = $('btn-enviar');
  if (enviar) enviar.addEventListener('click', enviarChat);

  const voz = $('btn-voz');
  if (voz) voz.addEventListener('click', alternarDictado);

  const campo = $('chat-texto');
  if (campo) {
    campo.addEventListener('input', e => { CHAT.borrador = e.target.value; });
    campo.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarChat(); }
    });
  }

  const foto = $('chat-foto');
  if (foto) {
    foto.addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        CHAT.imagen = await leerFoto(f);
        render();
      } catch (err) {
        nuevoMensaje('asistente', 'No pude leer esa imagen. Probá con otra foto.');
        render();
      }
    });
  }

  const quitar = $('btn-quitar-foto');
  if (quitar) quitar.addEventListener('click', () => { CHAT.imagen = null; render(); });

  vista.querySelectorAll('.ficha [data-acc]').forEach(el => {
    const ficha  = el.closest('.ficha');
    const msgId  = ficha.dataset.msg;
    const indice = parseInt(ficha.dataset.linea, 10);
    const acc    = el.dataset.acc;

    if (acc === 'confirmar') el.addEventListener('click', () => confirmarLinea(msgId, indice));
    if (acc === 'corregir')  el.addEventListener('click', () => corregirLinea(msgId, indice));
    if (acc === 'elegir')    el.addEventListener('change', e => {
      if (e.target.value) elegirProducto(msgId, indice, e.target.value);
    });
  });

  alFinalDelHilo();
}
