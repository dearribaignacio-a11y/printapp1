/* ==========================================================================
   CITROSAFE BIO — comportamiento del sitio.
   JavaScript vanilla, sin dependencias ni build step.
   Todo es progresivo: si el JS no carga, el sitio se lee igual.
   ========================================================================== */
(function () {
  "use strict";

  var menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     1. Header: estado fijo al bajar
     ------------------------------------------------------------------ */
  var barra = document.querySelector("[data-barra]");

  function actualizarBarra() {
    if (!barra) return;
    barra.classList.toggle("esta-fija", window.scrollY > 24);
  }

  /* ------------------------------------------------------------------
     2. Menú móvil
     ------------------------------------------------------------------ */
  var boton = document.querySelector("[data-hamburguesa]");
  var nav = document.querySelector("[data-nav]");

  function cerrarMenu() {
    if (!boton || !nav) return;
    boton.setAttribute("aria-expanded", "false");
    nav.classList.remove("esta-abierta");
    document.body.style.removeProperty("overflow");
  }

  if (boton && nav) {
    boton.addEventListener("click", function () {
      var abierto = boton.getAttribute("aria-expanded") === "true";
      boton.setAttribute("aria-expanded", String(!abierto));
      nav.classList.toggle("esta-abierta", !abierto);
      document.body.style.overflow = !abierto ? "hidden" : "";
    });

    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) cerrarMenu();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") cerrarMenu();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 820) cerrarMenu();
    });
  }

  /* ------------------------------------------------------------------
     3. Títulos partidos en palabras (aparición escalonada)
     ------------------------------------------------------------------ */
  document.querySelectorAll("[data-partir]").forEach(function (nodo) {
    var indice = 0;

    // Recorre sólo los nodos de texto para no romper <em>, <br> ni enlaces.
    (function recorrer(elemento) {
      Array.prototype.slice.call(elemento.childNodes).forEach(function (hijo) {
        if (hijo.nodeType === 3) {
          var partes = hijo.textContent.split(/(\s+)/);
          if (!partes.length) return;
          var fragmento = document.createDocumentFragment();
          partes.forEach(function (parte) {
            if (!parte) return;
            if (/^\s+$/.test(parte)) {
              fragmento.appendChild(document.createTextNode(parte));
              return;
            }
            var span = document.createElement("span");
            span.className = "palabra";
            span.style.setProperty("--i", indice++);
            span.textContent = parte;
            fragmento.appendChild(span);
          });
          elemento.replaceChild(fragmento, hijo);
        } else if (hijo.nodeType === 1 && !hijo.classList.contains("palabra")) {
          recorrer(hijo);
        }
      });
    })(nodo);
  });

  /* ------------------------------------------------------------------
     4. Aparición al scroll
     ------------------------------------------------------------------ */
  var porRevelar = document.querySelectorAll(
    "[data-anim], [data-partir], .capitulo, .impacto, .escalera"
  );

  // Escalonado de las tarjetas dentro de una misma grilla.
  document.querySelectorAll("[data-grupo]").forEach(function (grupo) {
    Array.prototype.slice.call(grupo.children).forEach(function (hijo, i) {
      if (!hijo.style.getPropertyValue("--retraso")) {
        hijo.style.setProperty("--retraso", i * 0.11 + "s");
      }
    });
  });

  // Los que todavía no aparecieron. El barrido de respaldo lo vacía.
  var pendientes = [];

  function revelar(el) {
    el.classList.add("es-visible");
    var i = pendientes.indexOf(el);
    if (i > -1) pendientes.splice(i, 1);
  }

  if (menosMovimiento || !("IntersectionObserver" in window)) {
    porRevelar.forEach(function (el) { el.classList.add("es-visible"); });
  } else {
    pendientes = Array.prototype.slice.call(porRevelar);

    var observador = new IntersectionObserver(
      function (entradas) {
        entradas.forEach(function (entrada) {
          if (!entrada.isIntersecting) return;
          revelar(entrada.target);
          observador.unobserve(entrada.target);
        });
      },
      // threshold 0 + margen inferior negativo: dispara cuando el borde superior
      // del elemento entra en la ventana. Un umbral por fracción (0.14) dejaba
      // sin aparecer a los bloques más altos que la pantalla, porque nunca
      // llegan a mostrar esa proporción de su alto.
      { threshold: 0, rootMargin: "0px 0px -12% 0px" }
    );

    pendientes.forEach(function (el) { observador.observe(el); });
  }

  /* Respaldo: ante un salto de scroll muy grande (ir al pie de un tirón, abrir
     con un ancla, restaurar la posición al volver atrás) el observer puede no
     alcanzar a informar un elemento que ya pasó. Nada puede quedar invisible,
     así que revelamos todo lo que quedó por encima del borde inferior. */
  var scrollAnterior = 0;

  function barrerPendientes() {
    var y = window.scrollY;
    var salto = Math.abs(y - scrollAnterior);
    scrollAnterior = y;

    // Sólo ante un salto grande: en el scroll normal manda el observer, que es
    // el que produce la aparición escalonada.
    if (!pendientes.length || salto < window.innerHeight * 0.9) return;

    var borde = window.innerHeight;
    pendientes.slice().forEach(function (el) {
      if (el.getBoundingClientRect().top < borde) revelar(el);
    });
  }

  /* ------------------------------------------------------------------
     5. Parallax sutil (sólo transform, dentro de requestAnimationFrame)
     ------------------------------------------------------------------ */
  var capas = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));

  function moverCapas() {
    if (menosMovimiento) return;
    var alto = window.innerHeight;
    capas.forEach(function (capa) {
      var caja = capa.getBoundingClientRect();
      if (caja.bottom < -200 || caja.top > alto + 200) return;
      var velocidad = parseFloat(capa.dataset.parallax) || 0.12;
      var centro = caja.top + caja.height / 2 - alto / 2;
      capa.style.transform = "translate3d(0," + (-centro * velocidad).toFixed(2) + "px,0)";
    });
  }

  /* ------------------------------------------------------------------
     6. Barra de progreso de lectura
     ------------------------------------------------------------------ */
  var progreso = document.querySelector("[data-progreso]");

  function actualizarProgreso() {
    if (!progreso) return;
    var recorrido = document.documentElement.scrollHeight - window.innerHeight;
    var avance = recorrido > 0 ? window.scrollY / recorrido : 0;
    progreso.style.transform = "scaleX(" + Math.min(1, Math.max(0, avance)) + ")";
  }

  /* ------------------------------------------------------------------
     7. Botón flotante de WhatsApp
     ------------------------------------------------------------------ */
  var flotante = document.querySelector("[data-flotante]");

  function actualizarFlotante() {
    if (!flotante) return;
    flotante.classList.toggle("esta-visible", window.scrollY > window.innerHeight * 0.6);
  }

  /* ------------------------------------------------------------------
     8. Un único listener de scroll, con rAF
     ------------------------------------------------------------------ */
  var pendiente = false;

  function alHacerScroll() {
    if (pendiente) return;
    pendiente = true;
    window.requestAnimationFrame(function () {
      actualizarBarra();
      actualizarProgreso();
      actualizarFlotante();
      moverCapas();
      barrerPendientes();
      pendiente = false;
    });
  }

  window.addEventListener("scroll", alHacerScroll, { passive: true });
  window.addEventListener("resize", alHacerScroll, { passive: true });
  alHacerScroll();

  /* ------------------------------------------------------------------
     9. Año actual en el pie
     ------------------------------------------------------------------ */
  document.querySelectorAll("[data-anio]").forEach(function (nodo) {
    nodo.textContent = String(new Date().getFullYear());
  });
})();
