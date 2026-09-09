/* =============================================================
   Navegacion y render de vistas.
   Cada pestania muestra una sola cosa; nada se apila.
   ============================================================= */

const $ = id => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fechaLarga(iso) {
  const d = new Date(iso + 'T00:00:00');
  const t = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* Escala redondeada para el eje del grafico. */
function escalaNice(max) {
  if (!max || max <= 0) return { max: 1000, paso: 250 };
  const mag  = Math.pow(10, Math.floor(Math.log10(max)));
  const tope = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].map(m => m * mag).find(c => c >= max) || 10 * mag;
  return { max: tope, paso: tope / 4 };
}

/* Estado de interfaz (no afecta los datos). */
/* ---------------- Mobile ----------------
   En el celular no alcanza con reacomodar lo mismo: se muestra menos.
   El corte es el mismo que usa el CSS. */

const CONSULTA_MOBILE = '(max-width: 900px)';
const HORAS_FRANJA_MOBILE = 4;   // 3 bloques del dia en vez de 6

function esMobile() {
  return window.matchMedia(CONSULTA_MOBILE).matches;
}

const UI = {
  filtroFranja: 'todas',
  filtroProducto: 'todos',
  historialAbierto: new Set(),

  /* Solo pesan en mobile: en escritorio todo esto ya se ve. */
  detallesResumen: false,
  filtrosAbiertos: false,
  ajusteAbierto: false,
  filasAbiertas: new Set()
};

/* Alternar una fila desplegable. La clave lleva prefijo de pantalla
   para que no se pisen entre pestañas. */
function alternarFila(clave) {
  if (UI.filasAbiertas.has(clave)) UI.filasAbiertas.delete(clave);
  else UI.filasAbiertas.add(clave);
  render();
}

/* Bloque de datos que aparece al tocar una fila. */
function detalleFila(pares) {
  return `
    <dl class="fila-detalle">
      ${pares.map(([k, v]) => `<div><dt>${k}</dt><dd class="num">${v}</dd></div>`).join('')}
    </dl>`;
}

/* ---------------- Vista 1: Resumen ---------------- */

function vistaResumen() {
  const r = resumen();
  return esMobile() ? resumenMobile(r) : resumenEscritorio(r);
}

/* En el celular: dos numeros grandes y nada mas. Lo demas se despliega
   solo si la persona lo busca. */
function resumenMobile(r) {
  const detalles = !UI.detallesResumen ? '' : `
    <div class="resumen-extra">
      <article class="card kpi kpi-chico" data-tone="costo">
        <p class="kpi-label">Costos totales</p>
        <p class="kpi-value num">${money(r.costosTotales)}</p>
        <p class="kpi-note">Costo de las ${num(r.unidades)} unidades que salieron</p>
      </article>
      <article class="card kpi kpi-chico" data-tone="positivo">
        <p class="kpi-label">Margen promedio</p>
        <p class="kpi-value num is-positivo">${pct(r.margenPromedio)}</p>
        <p class="kpi-note">Ponderado sobre el total facturado</p>
      </article>
      <dl class="fila-detalle">
        <div><dt>Primera venta</dt><dd class="num">${r.primera}</dd></div>
        <div><dt>Última venta</dt><dd class="num">${r.ultima}</dd></div>
        <div><dt>Ticket promedio</dt><dd class="num">${money(r.ticketPromedio)}</dd></div>
        <div><dt>Productos distintos</dt><dd class="num">${r.productosDistintos}</dd></div>
      </dl>
    </div>`;

  return `
    <div class="resumen-mobile">
      <article class="card kpi kpi-grande" data-tone="positivo">
        <p class="kpi-label">Ganancia del día</p>
        <p class="kpi-value num is-positivo">${money(r.ganancia)}</p>
        <p class="kpi-note">Lo que te quedó después de los costos</p>
      </article>

      <article class="card kpi kpi-grande" data-tone="venta">
        <p class="kpi-label">Ventas totales</p>
        <p class="kpi-value num">${money(r.ventasTotales)}</p>
        <p class="kpi-note">${r.operaciones} ventas en el día</p>
      </article>

      <button class="btn-desplegar" id="btn-detalles" aria-expanded="${UI.detallesResumen}">
        ${UI.detallesResumen ? 'Ocultar detalles' : 'Ver más detalles'}
      </button>

      ${detalles}
    </div>`;
}

function resumenEscritorio(r) {
  const tarjetas = [
    {
      label: 'Ganancia del día',
      valor: money(r.ganancia),
      tono: 'positivo',
      clase: 'is-positivo',
      nota: 'Ventas menos el costo de la mercadería vendida'
    },
    {
      label: 'Ventas totales',
      valor: money(r.ventasTotales),
      tono: 'venta',
      clase: '',
      nota: r.operaciones + ' operaciones registradas en el día'
    },
    {
      label: 'Costos totales',
      valor: money(r.costosTotales),
      tono: 'costo',
      clase: '',
      nota: 'Costo de las ' + num(r.unidades) + ' unidades que salieron'
    },
    {
      label: 'Margen promedio',
      valor: pct(r.margenPromedio),
      tono: 'positivo',
      clase: 'is-positivo',
      nota: 'Ponderado sobre el total facturado'
    }
  ];

  return `
    <div class="kpi-grid">
      ${tarjetas.map(t => `
        <article class="card kpi" data-tone="${t.tono}">
          <p class="kpi-label">${t.label}</p>
          <p class="kpi-value num ${t.clase}">${t.valor}</p>
          <p class="kpi-note">${t.nota}</p>
        </article>`).join('')}
    </div>

    <div class="resumen-pie">
      <span>Primera venta <strong class="num">${r.primera}</strong></span>
      <span>Última venta <strong class="num">${r.ultima}</strong></span>
      <span>Ticket promedio <strong class="num">${money(r.ticketPromedio)}</strong></span>
      <span>Productos distintos vendidos <strong class="num">${r.productosDistintos}</strong></span>
    </div>
  `;
}


/* ---------------- Vista 2: Ventas por hora ---------------- */

function vistaHoras() {
  return esMobile() ? horasMobile() : horasEscritorio();
}

/* En el celular: tres bloques del dia, la conclusion arriba y dentro de
   la misma tarjeta, para que no compitan dos bloques por la atencion. */
function horasMobile() {
  const bandas = franjas(HORAS_FRANJA_MOBILE);
  const pico   = franjaPico(bandas);
  const total  = bandas.reduce((s, b) => s + b.ingreso, 0);
  const tope   = Math.max(...bandas.map(b => b.ingreso)) || 1;

  const filas = bandas.map(b => {
    const esPico = b === pico;
    return `
      <div class="franja ${esPico ? 'is-pico' : ''}">
        <div class="franja-cab">
          <strong>${b.nombre}</strong>
          <span class="num">${b.ingreso ? money(b.ingreso) : '—'}</span>
        </div>
        <div class="bar-track">
          <div class="franja-fill" style="width:${(b.ingreso / tope) * 100}%"></div>
        </div>
        <p class="franja-pie num">${b.etiqueta} h · ${b.operaciones} ventas</p>
      </div>`;
  }).join('');

  return `
    <section class="card chart-card">
      <p class="titular">
        Lo más fuerte fue <strong>${franjaConArticulo(pico.nombre)}</strong>:
        <strong class="num">${money(pico.ingreso)}</strong> de
        <strong class="num">${money(total)}</strong> en el día.
      </p>
      <div class="franjas">${filas}</div>
    </section>`;
}

function horasEscritorio() {
  const bandas = franjas();
  const pico   = franjaPico(bandas);
  const total  = bandas.reduce((s, b) => s + b.ingreso, 0);
  const escala = escalaNice(Math.max(...bandas.map(b => b.ingreso)));

  const lineas = [];
  for (let v = 0; v <= escala.max; v += escala.paso) {
    const bottom = (v / escala.max) * 100;
    lineas.push(`
      <div class="grid-line" style="bottom:${44 + (bottom / 100) * (300 - 44)}px"></div>
      <div class="grid-label num" style="bottom:${44 + (bottom / 100) * (300 - 44)}px">${money(v)}</div>
    `);
  }

  const columnas = bandas.map(b => {
    const alto = escala.max ? (b.ingreso / escala.max) * 100 : 0;
    const esPico = b === pico;
    return `
      <div class="bar-col ${esPico ? 'is-pico' : ''}">
        <span class="bar-value num">${b.ingreso ? money(b.ingreso) : '—'}</span>
        <div class="bar" style="height:${alto}%"></div>
      </div>`;
  }).join('');

  const etiquetas = bandas.map(b =>
    `<div class="${b === pico ? 'is-pico' : ''}">${b.etiquetaCorta} h</div>`
  ).join('');

  const participacion = total ? (pico.ingreso / total) * 100 : 0;

  return `
    <section class="card chart-card">
      <div class="chart-head">
        <div>
          <h2>Facturación por franja horaria</h2>
          <p>Agrupado cada ${CONFIG.franjaHoras} horas, de ${hhmm(CONFIG.aperturaHora)} a ${hhmm(CONFIG.cierreHora)}</p>
        </div>
        <div class="chart-total">
          <span>Total del día</span>
          <strong class="num">${money(total)}</strong>
        </div>
      </div>

      <div class="chart">
        ${lineas.join('')}
        <div class="bars">${columnas}</div>
        <div class="bar-label">${etiquetas}</div>
      </div>
    </section>

    <div class="pico-nota">
      <span class="tag">Mayor movimiento</span>
      <p>
        La franja de <strong>${pico.etiqueta}</strong> concentró
        <strong class="num">${money(pico.ingreso)}</strong> en
        <strong class="num">${pico.operaciones}</strong> operaciones:
        el <strong class="num">${pct(participacion)}</strong> de la facturación del día.
      </p>
    </div>
  `;
}

/* ---------------- Vista 3: Productos ---------------- */

function vistaProductos() {
  return esMobile() ? productosMobile() : productosEscritorio();
}

/* Controles de inflacion: en el celular arrancan plegados para que la
   pantalla abra con la lista, no con un formulario. */
function controlesInflacion(plegable) {
  const abierto = !plegable || UI.ajusteAbierto;

  const cuerpo = !abierto ? '' : `
    <div class="control">
      <label for="inf">Inflación mensual estimada</label>
      <input id="inf" type="number" step="0.1" min="0" max="100" value="${CONFIG.inflacionMensualPct}">
    </div>
    <div class="control">
      <label for="dias">Días desde la compra del stock</label>
      <input id="dias" type="number" step="1" min="0" max="365" value="${CONFIG.diasDesdeCompraStock}">
    </div>
    <button class="btn-reset" id="reset-inf">Restablecer</button>
    <p class="control-nota">
      Este porcentaje lo define el comercio: es un supuesto propio, no un dato oficial.
      Con él se estima cuánto costaría reponer hoy cada producto y cuánta ganancia
      queda una vez repuesta la mercadería.
    </p>`;

  return `
    ${plegable ? `<button class="btn-desplegar" id="btn-ajuste" aria-expanded="${abierto}">
      ${abierto ? 'Ocultar ajuste por inflación' : 'Ajustar por inflación'}
    </button>` : ''}
    ${abierto ? `<section class="card controls">${cuerpo}</section>` : ''}`;
}

function productosMobile() {
  const items = productosVendidos();

  const filas = items.map(i => {
    const p = i.producto;
    const clave = 'prod:' + p.id;
    const abierta = UI.filasAbiertas.has(clave);

    return `
      <article class="card fila ${abierta ? 'es-abierta' : ''}">
        <button class="fila-cab" data-fila="${clave}" aria-expanded="${abierta}">
          <span class="fila-nombre">${esc(p.nombre)}</span>
          <span class="fila-valor num pos">${money(i.ganancia)}</span>
          <span class="fila-sub">${num(i.unidades)} ${esc(p.unidad)} vendidas</span>
          <span class="fila-flecha" aria-hidden="true"></span>
        </button>
        ${abierta ? detalleFila([
          ['Costo', money(p.costo)],
          ['Precio', money(p.precio)],
          ['Ganancia por unidad', money(i.gananciaUnitaria)],
          ['Margen', pct(i.margen)],
          ['Reponer hoy sale', money(i.costoAjustadoUnitario)],
          ['Ganancia ajustada', money(i.gananciaAjustada)]
        ]) : ''}
      </article>`;
  }).join('');

  return `
    <p class="titular">
      Ganaste <strong class="num pos">${money(items.reduce((s, i) => s + i.ganancia, 0))}</strong>
      con <strong class="num">${items.length}</strong> productos.
      Tocá uno para ver costo, precio y margen.
    </p>

    <div class="filas">${filas}</div>

    ${controlesInflacion(true)}`;
}

function productosEscritorio() {
  const items = productosVendidos();

  const totNominal = items.reduce((s, i) => s + i.ganancia, 0);
  const totAjust   = items.reduce((s, i) => s + i.gananciaAjustada, 0);
  const totUnid    = items.reduce((s, i) => s + i.unidades, 0);
  const dif        = totAjust - totNominal;

  const filas = items.map(i => {
    const p = i.producto;
    const chip = i.margen >= 55 ? 'chip-ok' : i.margen >= 40 ? 'chip-info' : 'chip-warn';
    return `
      <tr>
        <td>
          <span class="cell-prod">
            <strong>${esc(p.nombre)}</strong>
            <small>${esc(p.categoria)}</small>
          </span>
        </td>
        <td>
          <span class="cell-num">
            <strong class="num">${money(p.costo)}</strong>
            <small class="num">reponer hoy ${money(i.costoAjustadoUnitario)}</small>
          </span>
        </td>
        <td class="num">${money(p.precio)}</td>
        <td class="num">${money(i.gananciaUnitaria)}</td>
        <td><span class="chip ${chip}">${pct(i.margen)}</span></td>
        <td class="num">${num(i.unidades)} ${esc(p.unidad)}</td>
        <td>
          <span class="cell-num">
            <strong class="num pos">${money(i.ganancia)}</strong>
            <small class="num">ajustada ${money(i.gananciaAjustada)}</small>
          </span>
        </td>
      </tr>`;
  }).join('');

  return `
    ${controlesInflacion(false)}

    <section class="ajuste">
      <div class="ajuste-item">
        <span>Ganancia nominal del día</span>
        <strong class="num pos">${money(totNominal)}</strong>
      </div>
      <div class="ajuste-item">
        <span>Ganancia ajustada por inflación</span>
        <strong class="num">${money(totAjust)}</strong>
      </div>
      <div class="ajuste-item">
        <span>Diferencia al reponer</span>
        <strong class="num neg">${money(dif)}</strong>
      </div>
    </section>

    <section class="card table-card">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Costo</th>
            <th>Precio</th>
            <th>Ganancia por unidad</th>
            <th>Margen</th>
            <th>Unidades</th>
            <th>Ganancia del día</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            <td class="muted">—</td>
            <td class="muted">—</td>
            <td class="muted">—</td>
            <td class="muted">—</td>
            <td class="num">${num(totUnid)}</td>
            <td>
              <span class="cell-num">
                <strong class="num pos">${money(totNominal)}</strong>
                <small class="num">ajustada ${money(totAjust)}</small>
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  `;
}


function conectarProductos() {
  const inf  = $('inf');
  const dias = $('dias');
  if (!inf || !dias) return;

  const aplicar = () => {
    const i = parseFloat(inf.value);
    const d = parseInt(dias.value, 10);
    CONFIG.inflacionMensualPct  = isFinite(i) && i >= 0 ? i : 0;
    CONFIG.diasDesdeCompraStock = isFinite(d) && d >= 0 ? d : 0;
    guardarPrefs();
    render();
  };

  inf.addEventListener('change', aplicar);
  dias.addEventListener('change', aplicar);

  $('reset-inf').addEventListener('click', () => {
    CONFIG.inflacionMensualPct  = 2.4;
    CONFIG.diasDesdeCompraStock = 30;
    guardarPrefs();
    render();
  });
}

/* ---------------- Vista 4: Movimientos ---------------- */

/* Filtrado comun a las dos versiones. */
function movimientosFiltrados(bandas) {
  let movs = movimientos();

  if (UI.filtroFranja !== 'todas') {
    const b = bandas.find(x => String(x.desde) === UI.filtroFranja);
    if (b) movs = movs.filter(m => { const h = Math.floor(m.minutos / 60); return h >= b.desde && h < b.hasta; });
  }
  if (UI.filtroProducto !== 'todos') {
    movs = movs.filter(m => m.productoId === UI.filtroProducto);
  }
  return movs;
}

function selectoresFiltro(bandas) {
  const opcionesFranja = ['<option value="todas">Todo el día</option>']
    .concat(bandas.map(b =>
      `<option value="${b.desde}" ${UI.filtroFranja === String(b.desde) ? 'selected' : ''}>${
        esMobile() ? b.nombre + ' · ' + b.etiquetaCorta + ' h' : b.etiqueta + ' h'}</option>`
    )).join('');

  const vendidos = [...new Set(movimientos().map(m => m.productoId))];
  const opcionesProd = ['<option value="todos">Todos los productos</option>']
    .concat(vendidos.map(id => {
      const p = productoPorId(id);
      return `<option value="${id}" ${UI.filtroProducto === id ? 'selected' : ''}>${esc(p.nombre)}</option>`;
    })).join('');

  return `
    <div class="control">
      <label for="f-franja">Rango horario</label>
      <select id="f-franja">${opcionesFranja}</select>
    </div>
    <div class="control">
      <label for="f-prod">Producto</label>
      <select id="f-prod">${opcionesProd}</select>
    </div>
    <button class="btn-reset" id="reset-filtros">Quitar filtros</button>`;
}

function vistaMovimientos() {
  return esMobile() ? movimientosMobile() : movimientosEscritorio();
}

/* En el celular cada venta muestra hora, producto y monto. Lo demas
   aparece al tocarla. Los filtros arrancan plegados. */
function movimientosMobile() {
  const bandas = franjas(HORAS_FRANJA_MOBILE);
  const movs   = movimientosFiltrados(bandas);
  const hayFiltro = UI.filtroFranja !== 'todas' || UI.filtroProducto !== 'todos';

  const lista = movs.length ? movs.map(m => {
    const clave = 'mov:' + m.id;
    const abierta = UI.filasAbiertas.has(clave);
    return `
      <article class="card fila ${abierta ? 'es-abierta' : ''} ${m.origen === 'asistente' ? 'es-asistente' : ''}">
        <button class="fila-cab" data-fila="${clave}" aria-expanded="${abierta}">
          <span class="fila-nombre">${esc(m.producto.nombre)}</span>
          <span class="fila-valor num">${money(m.ingreso)}</span>
          <span class="fila-sub num">${m.hora} · ${num(m.cantidad)} ${esc(m.producto.unidad)}</span>
          <span class="fila-flecha" aria-hidden="true"></span>
        </button>
        ${abierta ? detalleFila([
          ['Precio por ' + esc(m.producto.unidad), money(m.precioAplicado)],
          ['Ganancia', '<span class="pos">' + money(m.ganancia) + '</span>'],
          ['Rubro', esc(m.producto.categoria)],
          ['Comprobante', esc(m.id) + (m.origen === 'asistente' ? ' · desde el asistente' : '')]
        ]) : ''}
      </article>`;
  }).join('')
    : '<div class="card vacio">No hay ventas con esos filtros.</div>';

  return `
    <p class="titular">
      <strong class="num">${movs.length}</strong>
      ${movs.length === 1 ? 'venta' : 'ventas'} por
      <strong class="num">${money(movs.reduce((s, m) => s + m.ingreso, 0))}</strong>.
      Tocá una para ver el detalle.
    </p>

    <div class="filas">${lista}</div>

    <button class="btn-desplegar" id="btn-filtros" aria-expanded="${UI.filtrosAbiertos}">
      ${UI.filtrosAbiertos ? 'Ocultar filtros' : (hayFiltro ? 'Cambiar filtros' : 'Filtrar')}
    </button>
    ${UI.filtrosAbiertos ? `<section class="card controls">${selectoresFiltro(bandas)}</section>` : ''}`;
}

function movimientosEscritorio() {
  const bandas = franjas();
  const movs   = movimientosFiltrados(bandas);
  const totalFiltrado = movs.reduce((s, m) => s + m.ingreso, 0);

  const lista = movs.length ? movs.map(m => `
    <article class="card mov ${m.origen === 'asistente' ? 'es-asistente' : ''}">
      <div class="mov-hora num">${m.hora}<small>${m.id}</small></div>
      <div class="mov-prod">
        <strong>${esc(m.producto.nombre)}</strong>
        <small>
          ${esc(m.producto.categoria)} · ${money(m.precioAplicado)} por ${esc(m.producto.unidad)}
          ${m.precioPropio ? '<span class="chip chip-warn">precio dictado</span>' : ''}
          ${m.origen === 'asistente' ? '<span class="chip chip-info">desde el asistente</span>' : ''}
        </small>
      </div>
      <div class="mov-cant num">${num(m.cantidad)} ${esc(m.producto.unidad)}</div>
      <div class="mov-monto">
        <strong class="num">${money(m.ingreso)}</strong>
        <small class="num">ganancia ${money(m.ganancia)}</small>
      </div>
    </article>`).join('')
    : '<div class="card vacio">No hay ventas registradas con los filtros seleccionados.</div>';

  return `
    <section class="card controls">${selectoresFiltro(bandas)}</section>

    <p class="filtros-resultado">
      <strong class="num">${movs.length}</strong> de <strong class="num">${ventasDelDia().length}</strong>
      ventas · total mostrado <strong class="num">${money(totalFiltrado)}</strong>
    </p>

    <div class="mov-list">${lista}</div>
  `;
}

function conectarMovimientos() {
  const f = $('f-franja');
  const p = $('f-prod');
  if (!f || !p) return;

  f.addEventListener('change', e => { UI.filtroFranja = e.target.value; render(); });
  p.addEventListener('change', e => { UI.filtroProducto = e.target.value; render(); });
  $('reset-filtros').addEventListener('click', () => {
    UI.filtroFranja = 'todas';
    UI.filtroProducto = 'todos';
    render();
  });
}

/* ---------------- Vista 5: Stock ---------------- */

function svgHistorial(s) {
  const p = s.producto;
  if (!s.historial.length) return '';

  const W = 300, H = 80, pad = 8;
  const pts = [];
  let prev = p.stockInicial;
  pts.push([0, prev]);
  s.historial.forEach((h, i) => {
    pts.push([i + 1, prev]);
    pts.push([i + 1, h.restante]);
    prev = h.restante;
  });
  pts.push([s.historial.length + 0.4, prev]);

  const maxX = pts[pts.length - 1][0] || 1;
  const px = x => (x / maxX) * W;
  const py = v => H - pad - (p.stockInicial ? (v / p.stockInicial) * (H - pad * 2) : 0);

  const linea = pts.map(([x, v]) => px(x).toFixed(1) + ',' + py(v).toFixed(1)).join(' ');
  const area  = '0,' + H + ' ' + linea + ' ' + W + ',' + H;
  const gid   = 'g-' + p.id;

  return `
    <svg class="hist-linea" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#A855F7" stop-opacity=".35"/>
          <stop offset="100%" stop-color="#A855F7" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${area}" fill="url(#${gid})"/>
      <polyline points="${linea}" fill="none" stroke="#C084FC" stroke-width="2"
                vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>`;
}

function vistaStock() {
  return esMobile() ? stockMobile() : stockEscritorio();
}

/* En el celular: nombre, cuanto queda y la barra. El resto al tocar. */
function stockMobile() {
  const items = stock().sort((a, b) => a.ratio - b.ratio);
  const criticos = items.filter(s => s.estado.clave === "critico");

  const filas = items.map(s => {
    const p = s.producto;
    const clave = "stock:" + p.id;
    const abierta = UI.filasAbiertas.has(clave);
    const chip = s.estado.clave === "ok" ? "chip-ok" : s.estado.clave === "atencion" ? "chip-warn" : "chip-alert";

    return `
      <article class="card fila ${abierta ? "es-abierta" : ""}">
        <button class="fila-cab" data-fila="${clave}" aria-expanded="${abierta}">
          <span class="fila-nombre">${esc(p.nombre)}</span>
          <span class="fila-valor num">${num(s.actual)} ${esc(p.unidad)}</span>
          <span class="fila-sub">
            ${s.estado.clave !== "ok" ? `<span class="chip ${chip}">${s.estado.texto}</span>` : "quedan en stock"}
          </span>
          <span class="fila-flecha" aria-hidden="true"></span>
        </button>
        <div class="bar-track fila-barra">
          <div class="bar-fill ${s.estado.clave}" style="width:${Math.max(0, Math.min(100, s.porcentaje))}%"></div>
        </div>
        ${abierta ? detalleFila([
          ["Stock inicial", num(p.stockInicial) + " " + esc(p.unidad)],
          ["Vendidas hoy", num(s.vendidas)],
          ["Repuesto hoy", num(s.repuesto)],
          ["Nivel", pct(s.porcentaje, 0)]
        ]) + (s.historial.length ? `<div class="hist-pasos hist-mobile">${s.historial.map(h => `
            <div class="hist-paso">
              <span class="h">${h.hora}</span>
              <span class="s ${h.tipo === "entrada" ? "es-entrada" : ""}">${h.tipo === "entrada" ? "+ " : "− "}${num(h.cantidad)}</span>
              <span class="r">quedan <b class="num">${num(h.restante)}</b></span>
            </div>`).join("")}</div>` : "") : ""}
      </article>`;
  }).join("");

  const aviso = criticos.length
    ? `<div class="alerta-stock">
         <span class="tag">Reponer</span>
         <p>Se está por acabar: <strong>${criticos.map(s => esc(s.producto.nombre)).join(", ")}</strong>.</p>
       </div>`
    : "";

  return aviso + `<div class="filas">${filas}</div>`;
}

function stockEscritorio() {
  const items = stock().sort((a, b) => a.ratio - b.ratio);
  const criticos = items.filter(s => s.estado.clave === 'critico');
  const umbral = Math.round(CONFIG.umbralStockCritico * 100);

  const aviso = criticos.length
    ? `<div class="alerta-stock">
         <span class="tag">Reponer</span>
         <p>
           <strong class="num">${criticos.length}</strong>
           ${criticos.length === 1 ? 'producto quedó' : 'productos quedaron'}
           por debajo del <strong class="num">${umbral} %</strong> del stock inicial:
           <strong>${criticos.map(s => esc(s.producto.nombre)).join(', ')}</strong>.
         </p>
       </div>`
    : `<div class="alerta-stock alerta-ok">
         <span class="tag">Sin alertas</span>
         <p>Ningún producto quedó por debajo del <strong class="num">${umbral} %</strong> de su stock inicial.</p>
       </div>`;

  const lista = items.map(s => {
    const p = s.producto;
    const chip = s.estado.clave === 'ok' ? 'chip-ok' : s.estado.clave === 'atencion' ? 'chip-warn' : 'chip-alert';
    const abierto = UI.historialAbierto.has(p.id);

    const historial = !abierto ? '' : `
      <div class="historial">
        <div>
          <h3>Nivel a lo largo del día</h3>
          ${svgHistorial(s)}
        </div>
        <div>
          <h3>Movimientos de stock</h3>
          <div class="hist-pasos">
            ${s.historial.map(h => `
              <div class="hist-paso">
                <span class="h">${h.hora}</span>
                <span class="s ${h.tipo === 'entrada' ? 'es-entrada' : ''}">${h.tipo === 'entrada' ? '+ ' : '− '}${num(h.cantidad)}</span>
                <span class="r">quedan <b class="num">${num(h.restante)}</b> ${esc(p.unidad)} · ${esc(h.refId)}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>`;

    return `
      <article class="card stock-item">
        <div class="stock-row">
          <div class="stock-nombre">
            <span class="stock-nombre-top">
              <strong>${esc(p.nombre)}</strong>
              ${s.estado.clave !== 'ok' ? `<span class="chip ${chip}">${s.estado.texto}</span>` : ''}
            </span>
            <small>${esc(p.categoria)} · inicial ${num(p.stockInicial)}${s.repuesto ? " + " + num(s.repuesto) + " repuesto" : ""} ${esc(p.unidad)}</small>
          </div>
          <div class="stock-bar-wrap">
            <div class="bar-track">
              <div class="bar-fill ${s.estado.clave}" style="width:${Math.max(0, Math.min(100, s.porcentaje))}%"></div>
            </div>
            <p class="bar-pct num">${pct(s.porcentaje, 0)} del stock del día</p>
          </div>
          <div class="stock-cifra">
            <strong class="num">${num(s.actual)} ${esc(p.unidad)}</strong>
            <small class="num">salieron ${num(s.vendidas)}</small>
          </div>
          <div class="stock-acciones">
            ${s.historial.length
              ? `<button class="btn-hist" data-hist="${p.id}">${abierto ? 'Ocultar historial' : 'Ver historial'}</button>`
              : `<span class="muted">Sin salidas hoy</span>`}
          </div>
        </div>
        ${historial}
      </article>`;
  }).join('');

  return aviso + `<div class="stock-list">${lista}</div>`;
}

function conectarStock() {
  $('view').querySelectorAll('[data-hist]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.hist;
      if (UI.historialAbierto.has(id)) UI.historialAbierto.delete(id);
      else UI.historialAbierto.add(id);
      render();
    });
  });
}

/* Botones que existen en varias pantallas: desplegar una fila y abrir
   los bloques que en mobile arrancan plegados. */
function conectarComunes() {
  $('view').querySelectorAll('[data-fila]').forEach(b => {
    b.addEventListener('click', () => alternarFila(b.dataset.fila));
  });

  [['btn-detalles', 'detallesResumen'],
   ['btn-ajuste',   'ajusteAbierto'],
   ['btn-filtros',  'filtrosAbiertos']].forEach(([id, campo]) => {
    const b = $(id);
    if (b) b.addEventListener('click', () => { UI[campo] = !UI[campo]; render(); });
  });
}

/* ---------------- Router ---------------- */

const VISTAS = {
  resumen: {
    titulo: 'Resumen del día',
    sub: 'Lo esencial de la jornada, sin entrar en detalle',
    render: vistaResumen
  },
  horas: {
    titulo: 'Ventas por hora',
    sub: 'Cómo se repartió la facturación a lo largo del día',
    render: vistaHoras,
    conectar: null
  },
  productos: {
    titulo: 'Productos vendidos',
    sub: 'Costo, precio y margen de cada producto que salió hoy',
    render: vistaProductos,
    conectar: conectarProductos
  },
  movimientos: {
    titulo: 'Movimientos del día',
    sub: 'Registro cronológico de cada venta, con filtros por horario y producto',
    render: vistaMovimientos,
    conectar: conectarMovimientos
  },
  stock: {
    titulo: 'Stock',
    sub: 'Nivel de existencias por producto y alertas de reposición',
    render: vistaStock,
    conectar: conectarStock
  },
  asistente: {
    titulo: 'Asistente',
    sub: 'Dictá, escribí o fotografiá una factura; se registra solo lo que confirmes',
    render: vistaAsistente,
    conectar: conectarAsistente
  }
};

function vistaActual() {
  const clave = (location.hash || '').replace('#', '');
  return VISTAS[clave] ? clave : 'resumen';
}

function render() {
  const clave = vistaActual();
  const vista = VISTAS[clave];

  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('is-active', a.dataset.view === clave);
  });

  $('view-title').textContent = vista.titulo;
  $('view-sub').textContent   = vista.sub;
  $('view').innerHTML         = vista.render();

  if (vista.conectar) vista.conectar();
  conectarComunes();
}

function iniciar() {
  cargarPrefs();
  cargarRegistro();
  cargarChat();

  $('topbar-meta').innerHTML =
    `<span class="meta-negocio"><strong>${esc(CONFIG.negocio)}</strong> · ${esc(CONFIG.rubro)}</span>` +
    `<span class="meta-fecha">${fechaLarga(CONFIG.fecha)}</span>`;
  $('foot-fecha').textContent = new Date(CONFIG.fecha + 'T00:00:00')
    .toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  window.addEventListener('hashchange', render);

  /* Al pasar de celular a escritorio (o al rotar) cambia lo que se
     muestra, no solo como se acomoda: hay que volver a dibujar. */
  const consulta = window.matchMedia(CONSULTA_MOBILE);
  const alCambiar = () => render();
  if (consulta.addEventListener) consulta.addEventListener('change', alCambiar);
  else if (consulta.addListener) consulta.addListener(alCambiar);

  if (!location.hash) location.hash = '#resumen';
  render();
}

/* Segun donde se embeba la pagina, el DOM puede estar listo antes de
   que corra este script. */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
