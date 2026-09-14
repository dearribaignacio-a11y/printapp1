# CitroSafe Bio — sitio de presentación

Sitio de dos páginas para presentar **CitroSafe Bio** a inversores: un
bioinsecticida y fitoprotector 100% biodegradable formulado a base de
d-limoneno y biocompuestos del aceite esencial de limón argentino (NOA).

> *"CitroSafe Bio: el poder protector del limón argentino cuidando a tu familia."*

## Qué hay acá

```
citrosafe-bio/
├── index.html          Landing principal (8 secciones)
├── fundadores.html     Nuestra historia / el equipo
├── netlify.toml        Configuración de despliegue
└── assets/
    ├── css/styles.css  Hoja de estilos única de las dos páginas
    ├── js/main.js      Scroll reveal, parallax, menú móvil, progreso
    └── img/LEEME.md    Prompts de IA para cada imagen pendiente
```

HTML, CSS y JavaScript vanilla. **Sin build step, sin npm, sin frameworks.**
Se abre con doble clic en `index.html` y funciona igual que en producción.

## Publicar en Netlify

**Opción rápida:** arrastrar la carpeta `citrosafe-bio/` a
[app.netlify.com/drop](https://app.netlify.com/drop). Listo.

**Desde el repositorio:** conectar el repo en Netlify y configurar

- Base directory: `citrosafe-bio`
- Publish directory: `citrosafe-bio`
- Build command: *(vacío)*

`netlify.toml` ya trae esa configuración, más cabeceras de caché y seguridad.

## Antes de publicar

1. ~~**Número de WhatsApp.**~~ Ya configurado: los seis enlaces de contacto
   apuntan a `+54 9 264 526-9184` (San Juan). Si alguna vez cambia:

   ```bash
   sed -i 's/5492645269184/NUEVO_NUMERO/g' index.html fundadores.html
   ```

   El formato es internacional, sin `+` ni espacios: `54` + `9` (móvil) +
   código de área sin el `0` + número sin el `15`.

2. **Mail de contacto.** `hola@citrosafebio.com.ar` aparece en ambos pies.

3. **Las dos imágenes.** El sitio usa dos fotos y nada más. Hay que guardarlas
   en `assets/img/` con estos nombres exactos:

   - `citrosafe-hero.png` — el render del producto, va en el hero de la landing.
   - `fundadores-equipo.jpg` — la foto del equipo, va en la página de fundadores.

   No hay que tocar el HTML: las rutas ya están escritas. Si el archivo falta,
   el hueco muestra un bloque con el degradé de la marca en vez de romperse.
   Más detalle en `assets/img/LEEME.md`.

4. **Dominio en los `canonical` y `og:url`** de ambas páginas.

## Decisiones de contenido

- **Sin cifras de venta, precios ni montos.** En ninguna parte del sitio. Donde
  hacía falta hablar de valor, se usa lenguaje cualitativo ("un producto
  accesible y de valor premium", "el margen queda del lado argentino").
- **El diagrama de la cadena de valor** (sección *Oportunidad*) usa tres
  escalones de altura creciente sin ejes ni números: transmite la progresión
  limón fresco → aceite esencial a granel → producto fraccionado, nada más.
- **La página de fundadores** tiene una paleta más cálida (ámbar sobre crema) y
  una columna de texto más angosta, para que se lea como un relato y no como un
  pitch.
- **Sólo dos imágenes en todo el sitio.** Las secciones que no las tienen se
  resuelven con tipografía, color e íconos: las presentaciones del producto
  abren con una cabecera tipográfica en vez de una foto, y diferenciación,
  mercado e impacto usan grillas de tres tarjetas.

## Detalles técnicos

- Mobile-first, responsive desde 320 px.
- Animaciones al scroll con `IntersectionObserver`; parallax con `transform`
  dentro de `requestAnimationFrame` (un solo listener de scroll).
- Respeta `prefers-reduced-motion`: con esa preferencia activa todo aparece
  estático, sin animaciones.
- Navegación por teclado, `skip link`, foco visible y `aria-label` en los íconos.
- Hoja de estilos de impresión: el pitch se puede imprimir prolijo.
- Tipografías Fraunces + Inter desde Google Fonts (lo único externo).
