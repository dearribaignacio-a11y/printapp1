# Print · Panel de gestión

Panel de ventas diario para un comercio chico —una gráfica y papelería—
pensado para alguien que no quiere abrir una planilla de cálculo.

Cada pantalla muestra una sola cosa. Todos los números se calculan a partir
de los datos crudos: no hay totales escritos a mano.

## Cómo hacerlo andar

**La forma simple**: abrí `index.html` con doble clic. No hace falta instalar
nada. Funciona todo salvo la parte del asistente que usa el modelo.

**Con el asistente completo** (interpreta con Claude y lee fotos de facturas):

```bash
npm install
```

Después poné tu clave en el entorno y arrancá el servidor:

```bash
$env:ANTHROPIC_API_KEY = "tu-clave"; npm start
```

Queda en <http://localhost:5173>.

En Linux o macOS el primer comando es `export ANTHROPIC_API_KEY="tu-clave"`.

## Las seis pantallas

| Pantalla | Qué muestra |
|---|---|
| **Resumen** | Ganancia del día, ventas, costos y margen. En el celular, sólo los dos primeros; el resto se despliega. |
| **Ventas por hora** | Facturación por franja horaria y cuál fue la de mayor movimiento. En el celular se agrupa en tres bloques: mañana, tarde y noche. |
| **Productos** | Costo, precio, ganancia por unidad, margen y unidades vendidas, más la comparación entre ganancia nominal y ajustada por inflación. |
| **Movimientos** | Cada venta del día con hora exacta, filtrable por rango horario y por producto. Es el registro auditable. |
| **Stock** | Nivel de existencias por producto, alerta cuando algo baja del 20 % y el historial de cómo se movió durante el día. |
| **Asistente** | Registrar ventas y compras dictando, escribiendo o fotografiando una factura. |

## El asistente

Se le dicta ("vendí doce cuadernos, total cinco mil pesos"), se le escribe, o
se le manda la foto de una factura de compra. El audio se pasa a texto con el
reconocimiento de voz del navegador; el texto va al servidor, y el servidor
—no el navegador— consulta a Claude.

Lo que devuelve se muestra como una ficha con los números resueltos y dos
botones. **Nada toca el stock ni las ventas hasta que se confirma.** Si el
producto no está en el catálogo, pregunta en vez de elegir uno parecido. Las
facturas de varios renglones se confirman uno por uno. La conversación queda
guardada como registro y no se borra al confirmar.

Sin clave configurada el asistente sigue andando: interpreta el texto en el
navegador y avisa que no puede leer fotos.

## Los archivos

```
index.html          estructura y navegación
styles.css          estilos (una sola hoja, sin framework)
data.js             productos y ventas del día — los datos crudos
calc.js             todos los cálculos derivados
chat.js             el asistente: dictado, foto, confirmaciones
app.js              render de cada pantalla y ruteo
serve.js            servidor estático + endpoint /api/interpretar
interpretador.js    instrucciones y esquema que recibe el modelo
```

## Configuración

Arriba de `data.js`, en `CONFIG`:

- `aperturaHora` / `cierreHora`: horario comercial (9 a 20).
- `franjaHoras`: cada cuántas horas agrupa el gráfico (2).
- `umbralStockCritico` / `umbralStockBajo`: 20 % y 40 % del stock del día.
- `inflacionMensualPct` y `diasDesdeCompraStock`: el supuesto de inflación con
  el que se estima cuánto cuesta reponer. **No es un dato oficial**: lo define
  el comercio y se edita desde la pestaña Productos.

No hay cálculo de impuestos.

## Datos de ejemplo

`data.js` trae 15 productos y 20 ventas de un día simulado, con la mañana
floja y el pico a media tarde. Reemplazá esas dos listas por las reales y todo
el panel se recalcula solo.

## Cuentas, planes y cobro

El panel en sí no necesita servidor. Las cuentas, los planes y el cobro
mensual sí, y viven aparte en Supabase:

```
supabase/migrations/     las tablas: usuarios, suscripciones, planes
supabase/functions/      crear la suscripción en Mercado Pago y recibir el aviso
test/                    interfaz de prueba del flujo completo, aparte del panel
```

El paso a paso —crear el proyecto de Supabase, las claves, los secrets y las
pruebas con Mercado Pago en sandbox— está en
[`docs/BACKEND.md`](docs/BACKEND.md).

El Access Token de Mercado Pago vive como secret de Supabase. Nunca está en
estos archivos ni llega al navegador.

## Publicarlo

Los seis archivos del frente (`index.html`, `styles.css`, `data.js`,
`calc.js`, `chat.js`, `app.js`) son estáticos: se suben tal cual a cualquier
hosting. En ese caso el asistente interpreta en el navegador y no lee fotos,
porque eso necesita `serve.js` corriendo como proceso Node —un VPS o un
hosting de Node, no un hosting compartido.

**La clave de la API nunca va al repositorio ni a un hosting público.** Vive
en la variable de entorno del servidor. `.env` está en `.gitignore`; usá
`.env.example` como molde.
