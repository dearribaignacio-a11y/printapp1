/* =============================================================
   Cálculos. Todo se deriva de PRODUCTOS y VENTAS; ningún total
   está escrito a mano.
   ============================================================= */

const _moneda = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS',
  minimumFractionDigits: 0, maximumFractionDigits: 0
});
const _numero = new Intl.NumberFormat('es-AR');

function money(n)        { return _moneda.format(Math.round(n || 0)); }
function num(n)          { return _numero.format(n || 0); }
function pct(n, dec = 1) { return (n || 0).toFixed(dec).replace('.', ',') + ' %'; }
function hhmm(h)         { return String(h).padStart(2, '0') + ':00'; }
function aMinutos(hora)  { const [h, m] = hora.split(':').map(Number); return h * 60 + m; }

/* ---------- Preferencias editables (inflación) ---------- */

const PREFS_KEY = 'print.prefs.v1';

function cargarPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (typeof p.inflacionMensualPct === 'number')  CONFIG.inflacionMensualPct  = p.inflacionMensualPct;
    if (typeof p.diasDesdeCompraStock === 'number') CONFIG.diasDesdeCompraStock = p.diasDesdeCompraStock;
  } catch (e) { /* sin persistencia disponible: se usan los valores por defecto */ }
}

function guardarPrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      inflacionMensualPct:  CONFIG.inflacionMensualPct,
      diasDesdeCompraStock: CONFIG.diasDesdeCompraStock
    }));
  } catch (e) { /* ignorado a propósito */ }
}

/* Costo de reponer hoy una unidad comprada hace N días,
   proyectando la inflación mensual que definió el comercio. */
function costoReposicion(costo) {
  const meses = CONFIG.diasDesdeCompraStock / 30;
  return costo * Math.pow(1 + CONFIG.inflacionMensualPct / 100, meses);
}

/* ---------- Base ---------- */

function productoPorId(id) {
  return PRODUCTOS.find(p => p.id === id);
}


/* ---------- Registro de lo confirmado desde el asistente ----------
   Las ventas y compras que el comercio confirma en el chat se guardan
   acá. VENTAS (data.js) es la jornada de base; esto es lo que se fue
   sumando durante el día. Nada entra sin confirmación explícita. */

const REGISTRO_KEY = 'print.registro.v1';
const REGISTRO = { ventas: [], compras: [] };

function cargarRegistro() {
  try {
    const raw = localStorage.getItem(REGISTRO_KEY);
    if (!raw) return;
    const r = JSON.parse(raw);
    if (Array.isArray(r.ventas))  REGISTRO.ventas  = r.ventas;
    if (Array.isArray(r.compras)) REGISTRO.compras = r.compras;
  } catch (e) { /* sin persistencia: el registro vive solo en memoria */ }
}

function guardarRegistro() {
  try {
    localStorage.setItem(REGISTRO_KEY, JSON.stringify(REGISTRO));
  } catch (e) { /* ignorado a proposito */ }
}

function horaActual() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function proximoId(prefijo, usados) {
  let n = 1;
  while (usados.includes(prefijo + String(n).padStart(2, '0'))) n++;
  return prefijo + String(n).padStart(2, '0');
}

/* Alta de una venta confirmada. precioUnitario es opcional: si el
   comerciante dijo un monto distinto al de lista, manda ese. */
function registrarVenta({ productoId, cantidad, precioUnitario, hora, mensajeId }) {
  const usados = VENTAS.map(v => v.id).concat(REGISTRO.ventas.map(v => v.id));
  const venta = {
    id: proximoId('V-', usados),
    hora: hora || horaActual(),
    productoId,
    cantidad,
    origen: 'asistente',
    mensajeId: mensajeId || null
  };
  if (typeof precioUnitario === 'number' && isFinite(precioUnitario)) {
    venta.precioUnitario = precioUnitario;
  }
  REGISTRO.ventas.push(venta);
  guardarRegistro();
  return venta;
}

/* Alta de una compra confirmada (factura del distribuidor): suma stock.
   No pisa el costo de lista del producto; queda asentado en la compra. */
function registrarCompra({ productoId, cantidad, costoUnitario, hora, mensajeId }) {
  const compra = {
    id: proximoId('C-', REGISTRO.compras.map(c => c.id)),
    hora: hora || horaActual(),
    productoId,
    cantidad,
    origen: 'asistente',
    mensajeId: mensajeId || null
  };
  if (typeof costoUnitario === 'number' && isFinite(costoUnitario)) {
    compra.costoUnitario = costoUnitario;
  }
  REGISTRO.compras.push(compra);
  guardarRegistro();
  return compra;
}

function ventasDelDia()  { return VENTAS.concat(REGISTRO.ventas); }
function comprasDelDia() { return REGISTRO.compras; }

/* ---------- Base ---------- */

function productoPorId(id) {
  return PRODUCTOS.find(p => p.id === id);
}

/* Cada venta con su producto y sus importes ya resueltos.
   Si la venta trae precio propio (lo dictado en el chat), manda ese. */
function movimientos() {
  return ventasDelDia()
    .map(v => {
      const p = productoPorId(v.productoId);
      const unitario = typeof v.precioUnitario === 'number' ? v.precioUnitario : p.precio;
      const ingreso  = unitario * v.cantidad;
      const costo    = p.costo * v.cantidad;
      return {
        ...v,
        producto: p,
        minutos: aMinutos(v.hora),
        precioAplicado: unitario,
        precioPropio: unitario !== p.precio,
        ingreso,
        costo,
        ganancia: ingreso - costo
      };
    })
    .sort((a, b) => a.minutos - b.minutos);
}

/* ---------- Resumen ---------- */

function resumen() {
  const movs = movimientos();
  const ventasTotales = movs.reduce((s, m) => s + m.ingreso, 0);
  const costosTotales = movs.reduce((s, m) => s + m.costo, 0);
  const ganancia      = ventasTotales - costosTotales;

  return {
    ventasTotales,
    costosTotales,
    ganancia,
    margenPromedio: ventasTotales ? (ganancia / ventasTotales) * 100 : 0,
    operaciones: movs.length,
    unidades: movs.reduce((s, m) => s + m.cantidad, 0),
    productosDistintos: new Set(movs.map(m => m.productoId)).size,
    ticketPromedio: movs.length ? ventasTotales / movs.length : 0,
    primera: movs.length ? movs[0].hora : null,
    ultima:  movs.length ? movs[movs.length - 1].hora : null
  };
}

/* ---------- Ventas por franja horaria ---------- */

/* Nombre corriente de la franja, para no obligar a leer horarios en el
   celular: "la tarde" se entiende mas rapido que "15:00 - 17:00". */
function nombreDeFranja(desde, hasta) {
  const medio = (desde + hasta) / 2;
  if (medio < 12) return 'Mañana';
  if (medio < 14) return 'Mediodía';
  if (medio < 18) return 'Tarde';
  return 'Noche';
}

/* Con articulo, para poder escribirlo dentro de una frase. */
function franjaConArticulo(nombre) {
  return nombre === 'Mediodía' ? 'el mediodía' : 'la ' + nombre.toLowerCase();
}

/* horasPorFranja permite agrupar mas grueso en pantallas chicas. */
function franjas(horasPorFranja) {
  const paso = horasPorFranja || CONFIG.franjaHoras;
  const bandas = [];

  for (let h = CONFIG.aperturaHora; h < CONFIG.cierreHora; h += paso) {
    const hasta = Math.min(h + paso, CONFIG.cierreHora);
    bandas.push({
      desde: h, hasta,
      etiqueta: hhmm(h) + ' – ' + hhmm(hasta),
      etiquetaCorta: String(h).padStart(2, '0') + '–' + String(hasta).padStart(2, '0'),
      nombre: nombreDeFranja(h, hasta),
      ingreso: 0, ganancia: 0, operaciones: 0, unidades: 0
    });
  }

  movimientos().forEach(m => {
    const h = Math.floor(m.minutos / 60);
    const b = bandas.find(b => h >= b.desde && h < b.hasta) || bandas[bandas.length - 1];
    b.ingreso     += m.ingreso;
    b.ganancia    += m.ganancia;
    b.unidades    += m.cantidad;
    b.operaciones += 1;
  });

  return bandas;
}

function franjaPico(bandas) {
  return (bandas || franjas()).reduce((a, b) => (b.ingreso > a.ingreso ? b : a));
}

/* ---------- Productos vendidos ---------- */

function productosVendidos() {
  const mapa = new Map();

  movimientos().forEach(m => {
    if (!mapa.has(m.productoId)) {
      mapa.set(m.productoId, { producto: m.producto, unidades: 0, ingreso: 0, costo: 0 });
    }
    const f = mapa.get(m.productoId);
    f.unidades += m.cantidad;
    f.ingreso  += m.ingreso;
    f.costo    += m.costo;
  });

  return [...mapa.values()].map(f => {
    const p = f.producto;
    const gananciaUnitaria = p.precio - p.costo;
    const costoAjustado    = costoReposicion(p.costo);
    const ajustadaUnitaria = p.precio - costoAjustado;

    return {
      ...f,
      gananciaUnitaria,
      margen: p.precio ? (gananciaUnitaria / p.precio) * 100 : 0,
      ganancia: f.ingreso - f.costo,
      costoAjustadoUnitario: costoAjustado,
      gananciaAjustadaUnitaria: ajustadaUnitaria,
      margenAjustado: p.precio ? (ajustadaUnitaria / p.precio) * 100 : 0,
      gananciaAjustada: ajustadaUnitaria * f.unidades
    };
  }).sort((a, b) => b.ganancia - a.ganancia);
}

/* ---------- Stock ---------- */

function estadoStock(ratio) {
  if (ratio <= CONFIG.umbralStockCritico) return { clave: 'critico', texto: 'Stock bajo' };
  if (ratio <= CONFIG.umbralStockBajo)    return { clave: 'atencion', texto: 'Atención' };
  return { clave: 'ok', texto: 'Suficiente' };
}

function stock() {
  const movs    = movimientos();
  const compras = comprasDelDia();

  return PRODUCTOS.map(p => {
    const salidas  = movs.filter(m => m.productoId === p.id);
    const entradas = compras.filter(c => c.productoId === p.id);

    const vendidas = salidas.reduce((s, m) => s + m.cantidad, 0);
    const repuesto = entradas.reduce((s, c) => s + c.cantidad, 0);

    const base   = p.stockInicial + repuesto;   // referencia del dia
    const actual = base - vendidas;
    const ratio  = base ? actual / base : 0;

    /* Historial del dia: salidas por venta y entradas por compra
       confirmada, en orden cronologico. */
    const eventos = salidas.map(m => ({
      hora: m.hora, refId: m.id, tipo: 'salida', cantidad: m.cantidad
    })).concat(entradas.map(c => ({
      hora: c.hora, refId: c.id, tipo: 'entrada', cantidad: c.cantidad
    }))).sort((a, b) => aMinutos(a.hora) - aMinutos(b.hora));

    let restante = p.stockInicial;
    const historial = eventos.map(e => {
      restante += e.tipo === 'entrada' ? e.cantidad : -e.cantidad;
      return { ...e, restante };
    });

    return {
      producto: p,
      vendidas,
      repuesto,
      base,
      actual,
      ratio,
      porcentaje: ratio * 100,
      estado: estadoStock(ratio),
      historial
    };
  });
}

function stockCritico() {
  return stock().filter(s => s.estado.clave === 'critico');
}
