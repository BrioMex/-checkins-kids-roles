# Área: activar tu app compartida sin contratar planes de pago

La app incluye el cliente Supabase, el esquema de base de datos, permisos, historial, importación inicial y PWA. Estos pasos se realizan en tus propias cuentas; no compartas contraseñas ni claves secretas.

## 1. Crear un proyecto Supabase Free

En [Supabase](https://supabase.com/dashboard), crea una organización **Free** y un proyecto nuevo dedicado a esta app. No uses un proyecto que ya contenga otras aplicaciones. Elige la región adecuada y guarda la contraseña de la base de datos en tu administrador de contraseñas.

No actives Pro, complementos, SMS, dominios de pago ni facturación adicional. Consulta las cuotas actuales en [los precios oficiales](https://supabase.com/pricing). Para unos 10 usuarios con una agenda de texto debería bastar Free, pero no es ilimitado ni una garantía perpetua de precio.

Free puede pausar el proyecto tras una semana sin actividad; no incluye respaldos automáticos ni garantía de disponibilidad. Si se agota una cuota, revisa el consumo antes de hacer cualquier cambio de plan. La app no activa ampliaciones de pago.

## 2. Crear tablas y permisos

Abre el **SQL Editor** del proyecto nuevo. Copia el contenido completo del archivo local:

`app\supabase\migrations\202611030001_workspace.sql`

Ejecuta la migración una sola vez. Contiene una transacción; si aparece un error, revisa el error antes de continuar. No ejecutes fragmentos sueltos para ocultarlo. Se crean las cinco áreas, las plantillas de servicios y los puestos iniciales; no se crean voluntarios ficticios ni una agenda.

La migración habilita RLS y concede a los usuarios autenticados solo lectura según sus permisos. Las escrituras pasan por funciones transaccionales que comprueban al usuario. Los permisos no dependen de botones ocultos ni de variables del navegador.

Si ya creaste la base con una versión anterior y al importar aparece `DELETE requires a WHERE clause` (código `21000`), ejecuta en el SQL Editor el contenido completo de `app\supabase\migrations\202611030002_import_safe_delete.sql` y vuelve a intentar la importación. Esta actualización solo reemplaza la función de importación; no recrea tablas ni borra datos al ejecutarse. Conserva los permisos y la transacción de importación. No desactives las protecciones de Supabase ni vuelvas a ejecutar la migración inicial sobre una base existente.

En **Database / Replication** o la sección de **Realtime** de tu Dashboard, verifica que `public.workspace_version` pertenezca a la publicación `supabase_realtime`. La migración lo añade si la publicación existe. No necesitas habilitar Realtime para el resto de las tablas: solo se anuncia un cambio de versión y los clientes autorizados vuelven a consultar.

## 3. Activar Google

Sigue la [guía oficial de Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google):

1. Crea un proyecto en Google Cloud para OAuth. No habilites servicios de pago ni facturación para esto.
2. Configura Google Auth Platform, su pantalla de consentimiento y la audiencia. Durante pruebas agrega las cuentas del equipo como usuarios de prueba cuando Google lo requiera.
3. Crea un cliente OAuth de tipo **Aplicación web**. Usa como URI de redirección autorizada la URL de callback que muestra Supabase: `https://TU-PROYECTO.supabase.co/auth/v1/callback`.
4. En Supabase, **Authentication / Sign In & Providers / Google**, activa Google e introduce el Client ID y Client Secret. **El secreto se queda en Supabase**, nunca en los archivos frontend.
5. Solicita únicamente los permisos básicos de identidad y correo. Para uso estable, revisa el estado de publicación y los requisitos de Google de tu aplicación de consentimiento.

Permite que Google cree las cuentas de autenticación en Supabase. Esto **no** concede acceso a la agenda: cada cuenta debe tener un correo de Google verificado y estar autorizada en la lista privada del espacio.

No hace falta SMTP: los usuarios entran por Google. La app no envía invitaciones, contraseñas ni correos de recuperación. Si más adelante eliges acceso por correo, revisa sus límites y configura un proveedor apropiado; el correo integrado de Supabase no debe asumirse como servicio de producción ilimitado.

## 4. Autorizar al primer administrador

Desde el SQL Editor, sustituye el texto por tu correo exacto de Google y ejecuta:

```sql
insert into public.access_grants(email, role)
values (lower('TU_CORREO_DE_GOOGLE'), 'admin');
```

Esto solo lo puede hacer quien controla el proyecto. Ningún visitante puede autoconcederse el perfil de administrador. No publiques tu lista real de correos en código, repositorios ni capturas.

Después del primer acceso podrás autorizar al resto desde **Configuración / Acceso del equipo**:

- Administrador: gestiona todo.
- Coordinador: asigna únicamente en sus áreas; consulta el resto.
- Voluntario: consulta, sin edición.

Vincula cada cuenta con una persona del directorio para **Mi participación**. Una persona del directorio no necesita cuenta para ser asignada. La lista de correos autorizados solo se entrega a administración.

## 5. Conectar los archivos locales

Necesitas Node.js 22.12 o posterior (se ha usado Node 24 en la validación).

En PowerShell, desde la carpeta que contiene `app`:

```powershell
Set-Location app
Copy-Item .env.example .env.local
```

Edita `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

Obtén ambos datos en la configuración/API del proyecto. Usa una clave **publicable** (`sb_publishable_...`) o la antigua **anon**. Nunca uses una clave `service_role`, `sb_secret_...`, la contraseña de PostgreSQL ni el Client Secret de Google. Las variables `VITE_` se incluyen en el navegador; estas dos son públicas por diseño y la protección real es RLS y las funciones de servidor.

`.env.local` está excluido del control de versiones. No se solicitan ni se guardan secretos del proyecto en esta guía.

Instala y arranca:

```powershell
npm ci
npm run dev
```

Abre `http://127.0.0.1:5173/`. En **Authentication / URL Configuration** de Supabase, añade esa dirección exacta como URL de redirección permitida para desarrollo. Si Vite utiliza otro puerto, autoriza ese puerto o inicia con `npm run dev -- --port 5173 --strictPort`.

No abras la versión funcional mediante doble clic: necesita HTTP o HTTPS. El prototipo anterior sigue separado en `prototipo\index.html`.

Si faltan variables o son incorrectas, verás una pantalla de configuración, no datos falsos ni un guardado local que parezca compartido. Reinicia Vite después de cambiar variables.

## 6. Importar tu Excel o comenzar desde cero

Inicia sesión con Google como administrador. Confirma la zona horaria en **Configuración / Tu comunidad** antes de crear fechas.

**Si vas a importar `Rol_x_area.xlsx`, hazlo antes de generar un periodo o crear voluntarios.** La importación inicial requiere directorio y calendario vacíos. Esto evita sobrescribir o duplicar una agenda que ya se esté usando.

Selecciona el `.xlsx` en **Importar Excel**. Se analiza localmente y se muestra una previsualización. El Office Script no se ejecuta. Solo al confirmar se envían los registros normalizados a Supabase; el archivo original no se sube ni se modifica.

Se reconocen las hojas `Voluntarios`, `Asignaciones Babies`, `Asignaciones Kinder`, `Asignaciones Kids`, `Asignaciones Preteens` y `Asignaciones Checkin`. Se recuperan:

- Nombre, estado, áreas y nota de cada voluntario.
- Servicios configurados en `L5:O10`, incluidos inactivos.
- Puestos en `L14:M23` y `L26:M35`.
- Fecha, servicio, puestos, personas asignadas y notas de las hojas de asignación.

Se ignoran la hoja resumen y el texto del Office Script. No se importan teléfonos ni correos de la hoja de voluntarios. Los accesos de Google se autorizan por separado.

Límites: archivo hasta 5 MB, 2.000 filas por hoja y 10.000 puestos. Los nombres deben ser únicos, cada persona activa debe tener al menos un área y las asignaciones deben corresponder a servicios y puestos configurados. Las personas inactivas pueden conservarse sin área, como ocurre en el Excel original. No se adivinan personas ni se corrigen conflictos silenciosamente. Si hay una persona desconocida, un puesto duplicado o una inconsistencia de área, corrige una copia del Excel y vuelve a previsualizar. La importación es una única transacción: si algo falla en el servidor, no queda una importación parcial.

Para empezar sin Excel, añade voluntarios desde el directorio, verifica servicios y puestos y usa **Generar periodo**. La generación añade solo fechas y puestos faltantes, hasta 121 días por operación; conserva personas, notas y versiones. No reparte personas automáticamente. Se asigna desde las tarjetas o la tabla avanzada.

Cambiar o desactivar una plantilla de servicio no altera las fechas ya generadas. Desactivar un puesto oculta sus espacios sin asignar del calendario, los contadores y la impresión; conserva y marca como inactivas las participaciones con personas asignadas. No se borran registros ni notas: al reactivarlo vuelven a mostrarse sus espacios ya generados. No se puede quitar un área a una persona ni desactivarla mientras tenga participaciones presentes o futuras afectadas: libera primero esos puestos.

## 7. Publicar gratis

### Opción A: GitHub Pages

GitHub Pages aloja la interfaz; Supabase sigue guardando los datos, validando permisos y gestionando Google. Con GitHub Free, el repositorio para Pages debe ser **público**. La página de acceso y los archivos de la interfaz serán públicos, pero la agenda solo se entrega a miembros autorizados por Supabase.

#### Publicación automática con GitHub Actions

El repositorio elegido es **`BrioMex/-checkins-kids-roles`**, con un guion inicial. Su sitio será **`https://briomex.github.io/-checkins-kids-roles/`**. No omitas ese guion al configurar Supabase.

El archivo `.github\workflows\pages.yml` publica automáticamente cada push a `main`: descarga las fuentes, instala las dependencias con `npm ci`, ejecuta las pruebas, compila y despliega solo `app\dist`. Detecta la ruta del repositorio mediante GitHub Pages, sin dejar fijo su nombre en el código. Los fuentes se guardan en GitHub; los Excel y datos privados, no.

Configuración inicial, una sola vez:

1. En el repositorio, abre **Settings / Secrets and variables / Actions / Variables** y crea dos **Repository variables**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, con los mismos valores públicos de `.env.local`. Nunca uses `service_role`, `sb_secret_...`, contraseñas ni el Client Secret de Google. El workflow se detiene si falta una variable; la compilación comprueba la URL y el tipo de clave.
2. En **Settings / Pages / Build and deployment**, elige **GitHub Actions**, no **Deploy from a branch**.
3. Sincroniza las fuentes con el repositorio. La raíz debe contener `.github`, `app` y `prototipo`; no coloques `app` dentro de otra carpeta ni subas `dist` a mano. Si esta carpeta todavía no está conectada, desde `xArea`:

   ```powershell
   gh auth login --hostname github.com --git-protocol https --web --scopes workflow
   gh auth setup-git
   git init -b main
   git remote add origin https://github.com/BrioMex/-checkins-kids-roles.git
   git add .gitignore .github app prototipo
   git status --short
   git diff --cached --stat
   git commit -m "Preparar app y publicacion automatica"
   git push -u origin main
   ```

   Ejecuta `git init` y `git remote add` solo si aún no existen. Estos comandos de primera subida presuponen un repositorio remoto vacío; si ya contiene cambios, sincronízalos antes, sin forzar el push. Antes del commit revisa los archivos: `.gitignore` excluye los Excel/PDF originales, dependencias, compilados, resultados de pruebas y `.env.local`. Solo se permiten los dos Excel ficticios de `app\tests\fixtures`. No añadas exportaciones JSON ni uses `git add -f` para saltarte exclusiones.
4. En **Actions**, espera a que **Publicar GitHub Pages** termine en verde. Para repetir sin cambiar código, usa **Run workflow** en esa misma pantalla; también sirve después de corregir las variables.
5. En Supabase, **Authentication / URL Configuration**, establece **Site URL** a `https://briomex.github.io/-checkins-kids-roles/` y añade esa misma dirección exacta en **Redirect URLs**, con la barra final. La URI de callback de Google sigue siendo `https://TU-PROYECTO.supabase.co/auth/v1/callback`; no la cambies por la de GitHub.
6. Abre el sitio, prueba Google y continúa con el paso 9.

Después de editar, desde `xArea` basta con:

```powershell
git add .github app prototipo .gitignore
git diff --cached --stat
git commit -m "Actualizar app"
git push
```

También puedes usar **Commit** y **Sync Changes** de VS Code. El despliegue tarda mientras pasan las pruebas y la compilación; no necesitas copiar `dist`, ni mantener tu laptop encendida después del push. Una sesión abierta puede mostrar **Actualizar app** al detectar la nueva PWA.

Cambiar variables en GitHub requiere volver a ejecutar el workflow. Las migraciones SQL de Supabase no se ejecutan automáticamente: aplícalas por separado desde el SQL Editor cuando una actualización las requiera. El workflow no recibe credenciales administrativas de la base.

Para revisar localmente el mismo paquete: `npm run build -- --base=/-checkins-kids-roles/` desde `app`. La clave publicable se incluye en el JavaScript por diseño; la protección de la agenda depende de RLS y las funciones de servidor, no de ocultar esa clave.

GitHub Pages no aplica el archivo `_headers`: las cabeceras personalizadas de la alternativa Cloudflare no estarán disponibles. Consulta la [guía oficial de workflows para Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

### Opción B: Cloudflare Pages

Desde `app`, con `.env.local` configurado:

```powershell
npm run build
```

La carpeta `app\dist` contiene la web lista para publicar. No subas `node_modules`, `.env.local`, los Excel originales ni la carpeta completa de trabajo.

En Cloudflare, crea un proyecto **Pages** gratuito con **carga directa de archivos estáticos** y sube el contenido de `dist` (la raíz publicada debe contener `index.html`). Usa su subdominio gratuito `pages.dev`. No hacen falta dominio comprado, Pages Functions, Workers de pago, R2 ni servicios adicionales.

Como alternativa, con un repositorio propio puedes configurar el build de Pages con raíz `app`, comando `npm ci && npm run build` y salida `dist`, añadiendo las dos variables públicas al entorno de compilación. Conserva también la carpeta hermana `prototipo` en las fuentes: se reutiliza su CSS; el resultado `dist` ya es autónomo.

En Supabase establece **Site URL** a la URL pública final y añade `https://TU-APP.pages.dev/` a las URLs de redirección permitidas. Conserva la dirección local solo si la necesitas. No uses comodines amplios. La URI de callback de Google sigue siendo la de Supabase, no la URL de Pages.

Después de publicar, cualquier cambio en las variables requiere compilar y publicar otra vez. La app no configura Supabase por cargar la web.

## 8. Instalar en teléfonos y computadoras

Bajo HTTPS:

- Android: abre en Chrome y utiliza **Instalar aplicación / Agregar a pantalla de inicio**.
- iPhone/iPad: abre en Safari y utiliza **Compartir / Añadir a pantalla de inicio**. Entra por Google desde Safari si el flujo de tu versión de iOS abre el proveedor fuera de la app instalada.
- Windows/macOS/Linux: abre en un navegador compatible e instala desde el menú si ofrece esa opción. En cualquier caso funciona como web.

La PWA guarda únicamente archivos públicos de la interfaz. **No guarda la agenda ni respuestas de Supabase en Cache Storage.** Las sesiones usan el almacenamiento que gestiona Supabase Auth; cierra sesión en dispositivos compartidos.

Si pierdes internet con la agenda abierta, la última lectura queda visible y la edición se desactiva. Después de cerrar o recargar sin conexión, la interfaz puede abrir, pero necesita internet para verificar permisos y recuperar datos privados. No hay una cola de escrituras offline ni una promesa de consultar toda la agenda offline.

Cuando haya una nueva versión de la interfaz, aparecerá **Actualizar app**. Termina o cancela los formularios antes de actualizar.

## 9. Verificación con tu proyecto real

Las pruebas locales no sustituyen esta comprobación, que requiere tus cuentas:

1. Entra con un administrador y, en otro dispositivo o perfil de navegador, con un coordinador autorizado.
2. Cambia una asignación. Comprueba que la segunda sesión la ve sin recargar cuando el indicador dice **tiempo real**.
3. Si Realtime no está disponible, la app informa que comprueba cada 45 segundos, además de al regresar a la pestaña y al pulsar Actualizar.
4. Verifica que el coordinador no edita otras áreas y que un voluntario solo consulta.
5. Abre el mismo puesto en ambos dispositivos y guarda cambios distintos: la segunda edición antigua debe rechazarse, sin sobrescribir.
6. Desactiva un acceso: cualquier nueva lectura/escritura debe rechazarse. Una pantalla ya abierta se limpia en la siguiente comprobación; una pestaña oculta puede retener su lectura en memoria hasta volver a activarse.
7. Prueba instalación y acceso por Google en los sistemas que realmente utilizará tu equipo. La emulación móvil de Chromium no valida Safari real ni todas las versiones de iOS.

Si el proyecto está pausado, reactívalo en Supabase y vuelve a comprobar. Ante un error de red durante un guardado, la app indica que **no pudo confirmar**: actualiza antes de repetir, porque una respuesta perdida no garantiza que el servidor no haya guardado.

## 10. Respaldos y mantenimiento

El botón Exportar JSON descarga la agenda y configuración que tu perfil puede consultar (incluidos accesos si eres administrador). No es un respaldo completo: no contiene cuentas de Auth ni una restauración automática. Trátalo como información privada.

Para un respaldo recuperable usa las herramientas oficiales de Supabase/PostgreSQL desde una computadora de confianza:

- [Respaldar y restaurar con Supabase CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- [Copias y límites por plan](https://supabase.com/docs/guides/platform/backups).

Guarda respaldos fuera del sitio publicado y prueba su restauración en un proyecto de prueba antes de depender de ellos. No pagues un complemento para seguir esta guía sin autorizar antes el costo. Revisa periódicamente uso de base de datos, transferencia e historial; la vista muestra 100 movimientos, pero el historial del servidor no se purga automáticamente.

## Pruebas incluidas y alcance de validación

```powershell
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Las pruebas SQL ejecutan la migración en PostgreSQL embebido PGlite, con el esquema mínimo de Auth simulado. Las pruebas de navegador conectan a ese PostgreSQL mediante una pasarela local que representa las respuestas de Supabase y los mensajes Realtime. No se conectan a un proyecto Supabase real ni inician sesión en Google.

La compilación incluye comprobación estricta de TypeScript. Las pruebas PWA validan manifiesto, iconos, caché pública y apertura del shell sin conexión. La verificación de Google, Supabase alojado, HTTPS, permisos de tu proyecto y teléfonos reales requiere completar los pasos anteriores.
