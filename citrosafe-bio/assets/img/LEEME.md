# Imágenes del sitio

Ninguna imagen está generada todavía. Cada lugar del sitio donde va una foto
tiene, en el HTML, un comentario con el **prompt de IA exacto** que hay que usar
y el nombre de archivo con el que se espera guardarla en esta carpeta.

Mientras no existan los archivos, cada hueco muestra un placeholder vectorial
diseñado a propósito (gradiente cítrico + ilustración SVG), así el sitio se ve
terminado igual y se puede presentar sin imágenes reales.

## Listado

| Archivo | Dónde va | Formato sugerido |
|---|---|---|
| `botella-hero.png` | Hero de la landing — mockup de la pistola gatillo 500 ml | PNG con fondo transparente u oscuro, 3:4 |
| `producto-gatillo.png` | Sección Producto — presentación Ready to Use | PNG/JPG, 4:3 |
| `producto-refill.png` | Sección Producto — Eco-Refill concentrado 100 ml | PNG/JPG, 4:3 |
| `qr-etiqueta.jpg` | Sección Producto — trazabilidad digital por QR | JPG, 16:10 |
| `escena-hogar.jpg` | Sección Mercado — uso cotidiano en casa | JPG, 3:4 |
| `equipo-aula.jpg` | Fundadores — foto conceptual del equipo | JPG, 3:4 |
| `finca-noa.jpg` | Fundadores — finca de limones del NOA | JPG, 16:10 |
| `og-citrosafe.jpg` | Vista previa al compartir la landing | JPG, 1200×630 |
| `og-fundadores.jpg` | Vista previa al compartir la página de fundadores | JPG, 1200×630 |

## Cómo reemplazar un placeholder

En el HTML, dentro de cada `<figure class="marco">` hay un bloque
`<div class="marco__arte">…</div>` con la ilustración provisional. Se borra ese
bloque entero y en su lugar va la imagen, con `alt` descriptivo:

```html
<figure class="marco">
  <img src="assets/img/botella-hero.png"
       alt="Botella pistola gatillo de 500 ml de CitroSafe Bio en PET reciclado ámbar"
       loading="lazy" width="900" height="1200">
  <figcaption class="marco__nota">Pistola gatillo 500 ml · PET reciclado ámbar</figcaption>
</figure>
```

(El `<div class="marco__ratio">` también se puede borrar cuando hay una imagen
real: sólo está para reservar la proporción del hueco.)

## Nota sobre la foto del equipo

Al ser menores de edad, el prompt de `equipo-aula.jpg` está escrito para que las
caras queden fuera de foco o de espaldas. Si en algún momento se usa una foto
real, hace falta autorización de las familias.
