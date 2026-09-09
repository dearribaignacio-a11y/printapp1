/* =============================================================
   Interpretacion de lo que dicta o fotografia el comerciante.
   Corre en el servidor para que la clave de la API nunca llegue
   al navegador.
   ============================================================= */

const MODELO = 'claude-opus-5';

const INSTRUCCIONES = [
  'Sos el asistente de carga de una grafica y papeleria. El comerciante te dicta,',
  'escribe o fotografia lo que vendio o lo que compro a un distribuidor.',
  '',
  'Tu unica tarea es interpretar el mensaje y devolverlo con la herramienta',
  'registrar_interpretacion. Siempre usa esa herramienta, nunca respondas suelto.',
  '',
  'Reglas:',
  '- Trabajas sobre el catalogo que viene en el mensaje. Usa el id exacto del producto.',
  '- Si el producto mencionado no esta en el catalogo, NO elijas uno parecido:',
  '  deja productoId en null, escribi en duda cual es el candidato mas cercano y',
  '  usa tipo "pregunta" para preguntarle al comerciante si es ese.',
  '- Si dice un monto total, calcula el unitario dividiendo por la cantidad.',
  '  Si dice un unitario, calcula el total multiplicando.',
  '- Si no menciona ningun monto, dejalos en null: los completa el sistema con',
  '  el precio de lista.',
  '- Una foto de factura es siempre una compra: devolve un renglon por cada item,',
  '  con la cantidad y el costo unitario que figuren.',
  '- No inventes datos que no esten en el mensaje ni en la imagen.',
  '- No calcules impuestos ni los menciones.',
  '',
  'El campo mensaje es lo que ve el comerciante. Escribilo en español rioplatense,',
  'corto, serio y concreto, diciendo que entendiste y pidiendo confirmacion.',
  'Ejemplo: "Entendi: vendiste 12 Cuaderno A5 tapa dura a $416 c/u (total $5.000).',
  ' Confirmas?". Sin emojis y sin saludos.'
].join('\n');

const HERRAMIENTA = {
  name: 'registrar_interpretacion',
  description: 'Devuelve la interpretacion estructurada del mensaje del comerciante ' +
               'para que la confirme antes de tocar el stock.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      tipo: {
        type: 'string',
        enum: ['venta', 'compra', 'pregunta', 'otro'],
        description: 'venta: salio mercaderia. compra: entro mercaderia. ' +
                     'pregunta: falta un dato o el producto no esta en el catalogo. ' +
                     'otro: el mensaje no describe un movimiento.'
      },
      mensaje: { type: 'string', description: 'Texto que se le muestra al comerciante.' },
      lineas: {
        type: 'array',
        description: 'Un renglon por producto detectado. Vacio si no hay ninguno.',
        items: {
          type: 'object',
          properties: {
            productoId:     { anyOf: [{ type: 'string' }, { type: 'null' }] },
            textoDetectado: { type: 'string', description: 'Como lo nombro el comerciante.' },
            cantidad:       { type: 'number' },
            unitario:       { anyOf: [{ type: 'number' }, { type: 'null' }] },
            total:          { anyOf: [{ type: 'number' }, { type: 'null' }] },
            duda:           { anyOf: [{ type: 'string' }, { type: 'null' }] }
          },
          required: ['productoId', 'textoDetectado', 'cantidad', 'unitario', 'total', 'duda'],
          additionalProperties: false
        }
      }
    },
    required: ['tipo', 'mensaje', 'lineas'],
    additionalProperties: false
  }
};

module.exports = { MODELO, INSTRUCCIONES, HERRAMIENTA };
