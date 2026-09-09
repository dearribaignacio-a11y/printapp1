/* =============================================================
   Datos crudos de la jornada.
   Nada de totales ni promedios acá: todo lo derivado se calcula
   en calc.js a partir de estas listas.
   ============================================================= */

const CONFIG = {
  negocio: 'Print',
  rubro: 'Gráfica y papelería',
  fecha: '2026-09-08',
  aperturaHora: 9,          // el local abre 09:00
  cierreHora: 20,           // y cierra 20:00
  franjaHoras: 2,           // agrupación del gráfico de ventas por hora
  umbralStockCritico: 0.20, // por debajo del 20% del stock inicial -> alerta
  umbralStockBajo: 0.40,    // por debajo del 40% -> atención

  /* Parámetros definidos por el comercio, editables desde la pestaña
     Productos. No son datos oficiales ni se toman de ninguna fuente
     externa: son el supuesto con el que el negocio decide trabajar. */
  inflacionMensualPct: 2.4,
  diasDesdeCompraStock: 30
};

/* Precios y costos en pesos, sin impuestos. */
const PRODUCTOS = [
  { id: 'p01', nombre: 'Cuaderno A5 tapa dura',      categoria: 'Papelería',  costo:  4200, precio:  7900, stockInicial:  40, unidad: 'u.' },
  { id: 'p02', nombre: 'Agenda 2026',                categoria: 'Papelería',  costo:  8500, precio: 15900, stockInicial:  25, unidad: 'u.' },
  { id: 'p03', nombre: 'Tarjetas personales x100',   categoria: 'Impresión',  costo:  5600, precio: 12500, stockInicial:  60, unidad: 'pack' },
  { id: 'p04', nombre: 'Plancha de stickers A4',     categoria: 'Impresión',  costo:   900, precio:  2600, stockInicial: 120, unidad: 'u.' },
  { id: 'p05', nombre: 'Banner lona 1x2 m',          categoria: 'Gran formato', costo: 18000, precio: 39000, stockInicial:  6, unidad: 'u.' },
  { id: 'p06', nombre: 'Imán personalizado',         categoria: 'Souvenirs',  costo:   350, precio:  1200, stockInicial: 200, unidad: 'u.' },
  { id: 'p07', nombre: 'Taza sublimada',             categoria: 'Sublimación',costo:  3100, precio:  8500, stockInicial:  45, unidad: 'u.' },
  { id: 'p08', nombre: 'Remera estampada',           categoria: 'Sublimación',costo:  7800, precio: 18500, stockInicial:  30, unidad: 'u.' },
  { id: 'p09', nombre: 'Llavero acrílico',           categoria: 'Souvenirs',  costo:   600, precio:  2200, stockInicial: 150, unidad: 'u.' },
  { id: 'p10', nombre: 'Carpeta institucional',      categoria: 'Papelería',  costo:  2400, precio:  5900, stockInicial:  80, unidad: 'u.' },
  { id: 'p11', nombre: 'Invitaciones x50',           categoria: 'Impresión',  costo:  9000, precio: 21000, stockInicial:   8, unidad: 'pack' },
  { id: 'p12', nombre: 'Volantes A6 x500',           categoria: 'Impresión',  costo: 11000, precio: 24000, stockInicial:  18, unidad: 'pack' },
  { id: 'p13', nombre: 'Gigantografía 2x3 m',        categoria: 'Gran formato', costo: 42000, precio: 89000, stockInicial: 6, unidad: 'u.' },
  { id: 'p14', nombre: 'Sello automático',           categoria: 'Papelería',  costo:  6200, precio: 14500, stockInicial:  22, unidad: 'u.' },
  { id: 'p15', nombre: 'Caja de regalo personalizada', categoria: 'Souvenirs',costo:  1800, precio:  4900, stockInicial:  70, unidad: 'u.' }
];

/* Ventas del día, en orden de ocurrencia.
   Mañana floja, mediodía sostenido, pico de media tarde. */
const VENTAS = [
  { id: 'V-01', hora: '09:15', productoId: 'p06', cantidad: 5  },
  { id: 'V-02', hora: '09:50', productoId: 'p01', cantidad: 2  },
  { id: 'V-03', hora: '10:20', productoId: 'p04', cantidad: 6  },
  { id: 'V-04', hora: '10:55', productoId: 'p09', cantidad: 4  },
  { id: 'V-05', hora: '11:30', productoId: 'p07', cantidad: 2  },
  { id: 'V-06', hora: '11:58', productoId: 'p10', cantidad: 10 },
  { id: 'V-07', hora: '12:25', productoId: 'p03', cantidad: 2  },
  { id: 'V-08', hora: '12:50', productoId: 'p14', cantidad: 1  },
  { id: 'V-09', hora: '13:40', productoId: 'p12', cantidad: 1  },
  { id: 'V-10', hora: '15:05', productoId: 'p08', cantidad: 6  },
  { id: 'V-11', hora: '15:35', productoId: 'p13', cantidad: 2  },
  { id: 'V-12', hora: '15:58', productoId: 'p05', cantidad: 4  },
  { id: 'V-13', hora: '16:20', productoId: 'p11', cantidad: 5  },
  { id: 'V-14', hora: '16:45', productoId: 'p07', cantidad: 8  },
  { id: 'V-15', hora: '17:10', productoId: 'p01', cantidad: 9  },
  { id: 'V-16', hora: '17:35', productoId: 'p02', cantidad: 5  },
  { id: 'V-17', hora: '17:52', productoId: 'p13', cantidad: 3  },
  { id: 'V-18', hora: '18:15', productoId: 'p15', cantidad: 12 },
  { id: 'V-19', hora: '18:40', productoId: 'p04', cantidad: 20 },
  { id: 'V-20', hora: '19:10', productoId: 'p06', cantidad: 15 }
];
