# Backend de Rindo · guía paso a paso

El panel de Rindo es HTML, CSS y JavaScript plano: no hay React ni Next, no
hay compilación. Así que el backend no vive en el mismo proyecto — vive en
**Supabase** (base de datos, login y dos funciones) y el panel le habla desde
el navegador. Eso es justo lo que hace falta para un hosting compartido como
Hostinger, que sirve archivos estáticos y nada más.

## Lo que se agrega al repositorio

```
supabase/
  migrations/0001_init.sql              las tablas, el trigger y los permisos
  config.toml                           el webhook no pide JWT; la otra sí
  functions/
    _shared/mercadopago.ts              CORS, firma y llamadas a Mercado Pago
    crear-suscripcion/index.ts          devuelve el link de checkout
    webhook-mercadopago/index.ts        confirma el pago y activa al usuario
test/
  index.html  estilo.css  app.js        interfaz de prueba (aparte del panel)
  config.js                             acá van la URL y la anon key
```

El panel real (`index.html`, `app.js`, `calc.js`, `data.js`, `chat.js`,
`styles.css`) **no se toca**. La carpeta `test/` es independiente.

---

## Paso 1 · Supabase

### 1.1 Crear el proyecto

1. Entrá a <https://supabase.com> y creá una cuenta (el plan gratuito alcanza).
2. **New project**. Ponele `rindo`.
3. Elegí una contraseña para la base y **guardala**: no se vuelve a mostrar.
4. Región: **South America (São Paulo)** es la más cercana a Argentina.
5. Esperá dos o tres minutos a que termine de crearse.

### 1.2 Conseguir las claves

En **Project Settings → API** vas a ver:

| Dato | Dónde se usa | ¿Es secreto? |
|---|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | en `test/config.js` y después en el panel | no |
| **anon / public key** | en `test/config.js` y después en el panel | **no**, es pública a propósito |
| **service_role key** | sólo dentro de las Edge Functions | **sí, nunca en el navegador** |

La anon key es pública por diseño: sola no da acceso a nada, porque las tablas
tienen Row Level Security. La `service_role` key, en cambio, saltea todos los
permisos — no la pegues nunca en un archivo del frente ni en este repositorio.

### 1.3 Crear las tablas

1. **SQL Editor → New query**.
2. Pegá todo el contenido de `supabase/migrations/0001_init.sql`.
3. **Run**.

Queda esto:

- **`planes`** — el catálogo: `hogar`, `comercial`, `comercial_pro`, con su
  precio. El precio vive acá y **no** lo manda el navegador: si lo mandara,
  cualquiera podría pagar un peso editando el HTML.
- **`usuarios`** — `id`, `email`, `nombre`, `plan_elegido`, `estado_pago`,
  `fecha_registro`. El `id` es el mismo que el de `auth.users`.
- **`suscripciones`** — `id`, `usuario_id`, `plan`, `mercadopago_id`, `estado`,
  `fecha_inicio`, `fecha_vencimiento`.

Un trigger crea la fila en `usuarios` sola, apenas alguien se registra.

**Ajustá los precios** antes de seguir (están de ejemplo en 4.900 / 9.900 /
19.900). En **Table Editor → planes**, o con SQL:

```sql
update public.planes set precio = 12000 where slug = 'comercial';
```

### 1.4 Configurar el login

En **Authentication → Providers → Email**, asegurate de que **Email** esté
habilitado.

Mientras probás conviene apagar **Confirm email** (en
**Authentication → Sign In / Providers**, o **Email Templates** según la
versión del panel): así te registrás y quedás logueado en el acto, sin ir al
correo. **Volvé a encenderlo antes de salir a producción**, si no cualquiera
se registra con un mail que no es suyo.

En **Authentication → URL Configuration → Site URL** poné la dirección donde
vas a subir la página (por ejemplo `https://tudominio.com`), y agregá en
**Redirect URLs** tanto `https://tudominio.com/test/` como
`http://localhost:5173/test/`.

---

## Paso 2 · La interfaz de prueba

Antes de tocar Mercado Pago conviene verificar que el registro y el login
funcionan. Se puede hacer ya mismo.

### 2.1 Cargar las claves

Abrí `test/config.js` y reemplazá los dos valores:

```js
window.RINDO_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
};
```

### 2.2 Abrirla

Tiene que servirse por HTTP, **no** con doble clic (`file://` rompe los
módulos de JavaScript). Con el servidor que ya tiene el proyecto:

```bash
npm start
```

y entrás a <http://localhost:5173/test/>.

### 2.3 Qué probar ahora

1. **Crear cuenta** con nombre, email y contraseña → tenés que ver la pantalla
   de planes.
2. En Supabase, **Table Editor → usuarios**: tiene que estar tu fila, con
   `estado_pago = sin_plan`.
3. **Cerrar sesión** y **volver a entrar** con el mismo email.
4. Probá los errores: registrarte con el mismo email dos veces
   ("ese email ya tiene una cuenta") y entrar con la contraseña mal
   ("email o contraseña incorrectos").
5. **Recargá la página estando logueado**: no te tiene que pedir el login de
   nuevo. La sesión queda guardada en el navegador y se renueva sola.

Abajo de todo hay un recuadro negro con lo que dice la base en crudo: sirve
para ver exactamente qué está pasando.

Los botones "Elegir" todavía no van a andar — falta Mercado Pago.

---

## Paso 3 · Mercado Pago en modo sandbox

### 3.1 Crear la aplicación y sacar el token de prueba

1. Entrá a <https://www.mercadopago.com.ar/developers/panel> con tu cuenta.
2. **Tus integraciones → Crear aplicación**. Nombre: `Rindo`. Producto:
   **Suscripciones**.
3. Dentro de la aplicación, **Credenciales de prueba**. Copiá el
   **Access Token**: empieza con `TEST-`.

Mientras uses ese token no se cobra plata de verdad.

### 3.2 Crear un usuario de prueba comprador

Mercado Pago **no deja que te suscribas a vos mismo**: el email del pagador
tiene que ser distinto del de la cuenta vendedora.

En **Tus integraciones → Cuentas de prueba → Crear cuenta de prueba**, creá
una cuenta **comprador** de Argentina con saldo. Anotá su email
(algo tipo `TESTUSER123456@testuser.com`) y su contraseña.

### 3.3 Cargar los secrets en Supabase

En **Project Settings → Edge Functions → Secrets** (o
**Edge Functions → Manage secrets**), agregá:

| Secret | Valor | Para qué |
|---|---|---|
| `MP_ACCESS_TOKEN` | el `TEST-...` del paso 3.1 | hablar con Mercado Pago |
| `MP_BACK_URL` | `https://tudominio.com/test/` | adónde vuelve el usuario después de pagar |
| `MP_WEBHOOK_SECRET` | lo sacás en el paso 3.5 | validar que el aviso es de MP |
| `MP_TEST_PAYER_EMAIL` | el email del comprador de prueba | forzar el pagador mientras probás |
| `ORIGENES_PERMITIDOS` | `https://tudominio.com,http://localhost:5173` | CORS |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen puestas solas: no las
agregues.

> **Esto es lo único que hace falta para la seguridad del punto 5 del pedido.**
> El Access Token vive acá adentro. El navegador nunca lo ve, nunca viaja en
> una respuesta y no está escrito en ningún archivo de este repositorio.

`MP_BACK_URL` tiene que ser **https**: Mercado Pago rechaza `http://localhost`.
Si todavía no subiste nada a Hostinger, poné la URL definitiva igual — sólo se
usa para el botón "Volver al sitio" del final del checkout.

`MP_TEST_PAYER_EMAIL` es sólo para probar: cuando pases a producción, borralo
y el sistema usa el email real de cada usuario.

### 3.4 Publicar las dos funciones

**Con la CLI** (lo recomendado, respeta `config.toml`):

```bash
npm install --save-dev supabase
npx supabase login
npx supabase link --project-ref TU-PROJECT-REF     # está en la URL del panel
npx supabase functions deploy crear-suscripcion
npx supabase functions deploy webhook-mercadopago --no-verify-jwt
```

**Desde el panel de Supabase**, si preferís no instalar nada: en
**Edge Functions → Create a new function**, creá `crear-suscripcion` y
`webhook-mercadopago`, y en cada una pegá el `index.ts` correspondiente más el
archivo `_shared/mercadopago.ts` (el editor permite varios archivos por
función). En `webhook-mercadopago` **desactivá** la opción de verificar el JWT.

Ese `--no-verify-jwt` no es un descuido: quien llama al webhook es Mercado
Pago, que no tiene una sesión de Supabase. La función se protege validando la
firma `x-signature`, que es lo que hace el archivo.

### 3.5 Configurar el webhook

1. La URL del webhook es
   `https://TU-PROYECTO.supabase.co/functions/v1/webhook-mercadopago`.
2. En Mercado Pago, dentro de tu aplicación: **Webhooks → Configurar
   notificaciones**. Pegá esa URL en **modo prueba**.
3. Marcá el evento **Suscripciones (`subscription_preapproval`)** y, si está,
   **Pagos de suscripción (`subscription_authorized_payment`)**.
4. Guardá. Mercado Pago te muestra una **clave secreta** — copiala y ponela en
   Supabase como `MP_WEBHOOK_SECRET`.

Si todavía no tenés la clave, la función igual funciona: avisa en los logs que
no está validando la firma. **No lo dejes así en producción.**

---

## Paso 4 · Probar el flujo completo

1. Abrí `test/index.html` servida por HTTP e iniciá sesión.
2. Elegí un plan. Deberías ir al checkout de Mercado Pago.
3. En la base, `usuarios.estado_pago` ya está en **`pendiente`** y hay una fila
   nueva en `suscripciones` con el `mercadopago_id`.
4. En el checkout, entrá con el **usuario de prueba comprador** (paso 3.2) y
   pagá con una tarjeta de prueba:

   | Tarjeta | Número | CVV | Vencimiento |
   |---|---|---|---|
   | Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
   | Visa | 4509 9535 6623 3704 | 123 | 11/30 |

   - Nombre del titular: **`APRO`** para que salga aprobado
     (**`OTHE`** para probar un rechazo).
   - Documento: DNI **12345678**.

5. Autorizá la suscripción. Volvés a la página de prueba.
6. La pantalla queda en "Esperando la confirmación" y consulta la base cada
   4 segundos. Cuando llega el aviso de Mercado Pago, el webhook pone
   `estado_pago = activo` y aparece **"Plan activo: Plan Comercial"**.

Si tarda más de un minuto, mirá **Edge Functions → webhook-mercadopago →
Logs** en Supabase: ahí está el aviso que llegó y qué hizo.

---

## Paso 5 · Pasar a producción

Cuando el flujo de prueba anda de punta a punta:

1. En Mercado Pago, copiá el **Access Token de producción** (empieza con
   `APP_USR-`) y reemplazá `MP_ACCESS_TOKEN` en Supabase.
2. **Borrá el secret `MP_TEST_PAYER_EMAIL`**: si queda, todos los cobros van a
   ir al comprador de prueba.
3. Configurá el webhook otra vez, ahora en **modo producción**, y actualizá
   `MP_WEBHOOK_SECRET` con la clave nueva.
4. Volvé a encender **Confirm email** en Supabase.
5. Dejá `ORIGENES_PERMITIDOS` sólo con tu dominio real, sin `localhost`.
6. Revisá los precios en la tabla `planes`.

No hace falta volver a publicar las funciones: leen los secrets en cada
llamada.

---

## Cómo se engancha con el panel real

Cuando quieras llevar esto al panel de Rindo, es el mismo código: la carpeta
`test/` es la referencia.

1. En `index.html`, antes de los `<script>` que ya están:

   ```html
   <script src="config.js"></script>
   ```

2. Un módulo con el cliente:

   ```js
   import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
   export const supabase = createClient(
     window.RINDO_CONFIG.SUPABASE_URL,
     window.RINDO_CONFIG.SUPABASE_ANON_KEY,
   );
   ```

3. Antes de renderizar el panel, `supabase.auth.getSession()`: si no hay
   sesión, mostrás el login; si hay, leés `usuarios` y, si `estado_pago` no es
   `activo`, mandás a elegir plan.

Lo único que cambia es el diseño de las pantallas. Las llamadas — `signUp`,
`signInWithPassword`, `functions.invoke("crear-suscripcion")` — son idénticas.

---

## Subirlo a Hostinger

Todo lo del frente es estático. Desde **hPanel → Administrador de archivos**,
subí a `public_html/` los archivos del panel, y la carpeta `test/` completa
adentro (queda en `https://tudominio.com/test/`).

Cuando termines de probar, **borrá la carpeta `test/` del hosting**: no tiene
sentido dejarla pública.

---

## Problemas frecuentes

**"Failed to fetch" al registrarse** — la URL de Supabase está mal escrita en
`config.js`, o abriste la página con doble clic en vez de por HTTP.

**Se registra pero no aparece en `usuarios`** — no corrió el trigger:
volvé a ejecutar `0001_init.sql` entero.

**Error de CORS al elegir plan** — falta tu dominio en `ORIGENES_PERMITIDOS`.
Tiene que ser el origen exacto, con `https://` y sin barra al final.

**La función responde 401** — te faltó `--no-verify-jwt` en el webhook, o se
venció la sesión en el navegador (cerrá sesión y volvé a entrar).

**Mercado Pago rechaza el preapproval** — casi siempre es una de tres: el
`payer_email` es el mismo de la cuenta vendedora, `MP_BACK_URL` no es https, o
el monto está por debajo del mínimo. El detalle exacto está en
**Edge Functions → crear-suscripcion → Logs**.

**Pagué pero sigue "pendiente"** — el webhook no llegó o falló la firma. Mirá
los logs de `webhook-mercadopago`. Desde el panel de Mercado Pago, en
**Webhooks**, podés reenviar la notificación para probar de nuevo.
