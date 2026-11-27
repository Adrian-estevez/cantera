# La Cantera · futbolconadrix

Web para seguir la cantera de tu club: fichas de jugadores, partidos con notas, historial de cada futbolista y herramientas para crear contenido en redes.

## Qué incluye

- **Registro y login**: cualquiera puede crearse una cuenta. También pueden recuperar la contraseña por email y cambiar su nombre o su contraseña desde "Mi cuenta".
- **Roles**:
  - *Usuario*: solo puede mirar.
  - *Colaborador*: puede añadir y editar jugadores, partidos y notas, pero no puede borrar jugadores ni partidos ni gestionar usuarios.
  - *Admin*: control total.
  El **primer usuario que se registra se convierte en admin automáticamente**.
- **Panel de usuarios** (solo admins): lista de registrados con su fecha de alta y su último acceso. Desde ahí puedes cambiar el rol de cada uno, bloquearlo, desbloquearlo o eliminar su cuenta. Siempre queda al menos un admin, para que nunca te quedes sin acceso.
- **Web pública o privada**: desde Ajustes eliges si cualquiera puede ver el contenido o solo los usuarios registrados. También puedes ocultar el botón de registro.
- **Jugadores**: foto, dorsal, nombre, apodo, posición y demarcación, pie, altura, fecha y lugar de nacimiento (la edad se calcula sola), nacionalidad, categoría, estado (activo, lesionado, cedido, primer equipo, baja), clubes anteriores en orden y una descripción. Puedes marcar a alguno como "a seguir" para que salga en portada.
- **Partidos**: fecha, categoría, competición, rival, local o visitante, resultado, crónica y MVP. Para cada jugador: titular o suplente, minutos, goles, asistencias, tarjetas, nota (0-10) y un comentario. El botón "Añadir toda la categoría" mete de golpe a todos los jugadores activos de esa categoría.
- **Ficha del jugador**: datos, trayectoria, estadísticas de la temporada (PJ, minutos, goles, asistencias, nota media, MVP, tarjetas), gráfica de evolución de notas, historial partido a partido e **informes** con fecha y etiqueta (fortaleza, a mejorar, noticia, lesión…).
- **Portada**: último resultado en grande, balance V-E-D, goleadores, mejores notas medias y jugadores a seguir.
- **Contenido para redes**:
  - *Tarjeta para redes*: genera una imagen PNG de 1080×1350 (formato Instagram) del jugador o del partido, con tu @.
  - *Copiar texto*: genera el texto del post con emojis, estadísticas, notas y hashtags.
- **Ajustes**: nombre del club, colores, temporada y categorías. Además permite exportar una copia de seguridad en JSON.
- Funciona en móvil y tiene modo oscuro automático.

## Probarla en tu ordenador (modo demo)

Si `js/config.js` está vacío, la web arranca en **modo demo** con datos inventados que se guardan solo en tu navegador. Hay tres cuentas de prueba que funcionan con cualquier contraseña: `admin@demo.es`, `colaborador@demo.es` y `aficionado@demo.es`.

```bash
cd cantera
python3 -m http.server 8000     # o: npx serve .
# abre http://localhost:8000
```

> Hay que abrirla con un servidor como este. Si haces doble clic en index.html no carga, porque los navegadores bloquean los módulos JS abiertos desde `file://`.

## Ponerla en producción (unos 15 minutos)

### 1. Supabase (base de datos, login y fotos, gratis)

1. Crea una cuenta en <https://supabase.com> y luego un proyecto nuevo.
2. Ve a **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y pulsa **Run**. Puedes volver a ejecutarlo cuando quieras para actualizar, sin perder datos.
3. Ve a **Project Settings → API** y copia la **Project URL** y la **anon public key**.

### 2. Configurar la web

Abre `js/config.js` y pega los dos valores:

```js
export const SUPABASE_URL = "https://xxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

La anon key **es pública por diseño**, así que no pasa nada porque esté en el código. La seguridad la ponen las reglas del `schema.sql`: todo el mundo puede leer, pero solo los usuarios de la tabla `admins` pueden escribir o subir fotos.

### 3. Vercel

**Opción A, con GitHub (recomendada):**
1. Sube la carpeta `cantera` a un repositorio de GitHub.
2. En <https://vercel.com>, entra en **Add New → Project** e importa el repositorio.
3. En Framework Preset elige **Other**. No hace falta build command ni output directory.
4. Pulsa **Deploy**. Cada vez que hagas `git push`, se actualizará sola.

**Opción B, desde la terminal:**
```bash
npm i -g vercel
cd cantera
vercel --prod
```

### 4. Ajustes de login en Supabase (después de tener la URL de Vercel)

1. **Authentication → URL Configuration**: en **Site URL** pon tu dirección de Vercel (por ejemplo, `https://cantera-xxx.vercel.app`) y añádela también en **Redirect URLs**. Así los enlaces de confirmación y de recuperar contraseña llevan a tu web.
2. **Regístrate tú el primero** en tu web: serás el admin.
3. **Emails de confirmación**: Supabase solo deja enviar unos pocos emails por hora con su servidor gratuito. Tienes dos opciones:
   - Para empezar: en **Authentication → Sign In / Providers → Email**, desactiva **Confirm email**. La gente entra nada más registrarse.
   - Para más adelante: configura un servidor de correo propio (por ejemplo Resend, gratis hasta 3.000 emails al mes) en **Authentication → Emails → SMTP Settings**.
4. (Opcional) En **Authentication → Emails → Templates** puedes traducir al español los emails de confirmación y de recuperación.

### 5. Dominio propio (opcional)
En Vercel ve a **Project → Settings → Domains** y añade, por ejemplo, `cantera.futbolconadrix.com`. Después actualiza la Site URL del punto anterior.

## Gestionar usuarios
En tu web, como admin, entra en **Usuarios**. Desde ahí cambias el rol de cada persona, la bloqueas o eliminas su cuenta.
Si alguna vez te quedas sin acceso, ejecuta esto en el SQL Editor de Supabase:
```sql
update public.profiles set role = 'admin', blocked = false where email = 'TU_EMAIL@ejemplo.com';
```

## Estructura

```
index.html          página principal
css/styles.css      estilos
js/config.js        claves de Supabase y tu @
js/app.js           vistas, formularios y navegación
js/store.js         conexión a Supabase (y modo demo)
js/share.js         tarjetas PNG y textos para redes
js/utils.js         utilidades (edad, fechas, estadísticas)
supabase/schema.sql tablas, seguridad y almacenamiento de fotos
vercel.json         configuración de Vercel
```

## Coste
Con los planes gratuitos de Supabase (500 MB de base de datos y 1 GB de fotos) y de Vercel tienes de sobra para varias temporadas de cantera. Las fotos se reducen automáticamente a 800 px antes de subirse.

Ojo: en el plan gratuito, Supabase pausa el proyecto si pasa 7 días sin visitas. Si la web tiene tráfico normal no te pasará. Si se pausa, se reactiva desde el panel.
