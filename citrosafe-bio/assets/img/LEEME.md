# Imágenes del sitio

El sitio usa **dos fotos y nada más**. El resto de las secciones se resuelve
con tipografía, color e íconos vectoriales, así que no hay que conseguir ni
generar ninguna imagen adicional.

| Archivo | Dónde va | Original |
|---|---|---|
| `citrosafe-hero.png` | Hero de `index.html`, columna derecha | Render del producto en el invernadero, 1280×720 |
| `fundadores-equipo.jpg` | `fundadores.html`, después del relato | Foto del equipo, 1269×952 |

## Cómo ponerlas

Guardar cada archivo en esta carpeta **con ese nombre exacto**. No hay que
tocar el HTML: las dos rutas ya están escritas.

Si el nombre o la extensión cambian, hay que actualizar el `src` en:

- `index.html` → buscar `assets/img/citrosafe-hero.png`
- `fundadores.html` → buscar `assets/img/fundadores-equipo.jpg`

En los dos casos el `src` aparece además como `og:image` en el `<head>` de esa
misma página, para la vista previa al compartir el link.

## Mientras no estén

El sitio no se rompe. Si el archivo falta, el `<img>` se esconde solo y queda a
la vista el degradé cítrico del contenedor, que es un bloque de color de la
marca. No aparece el ícono de imagen rota ni el texto alternativo suelto.

## Encuadre

- **Hero:** en escritorio el hueco es vertical (4:5) y la foto se recorta al
  centro con `object-fit: cover`, así que el envase queda centrado y se pierden
  los costados. En celular pasa a 16:9 y se ve casi completa. Si preferís que
  no se recorte nunca, cambiar `aspect-ratio: 4 / 5` por `16 / 9` en la regla
  `.marco--hero` de `assets/css/styles.css`.
- **Equipo:** se muestra entera, sin recorte, con el epígrafe debajo.

## Peso

Conviene exportarlas a un ancho máximo de 1600 px y comprimirlas antes de
subirlas (WebP o JPEG de calidad ~80). Netlify las sirve tal cual estén.
