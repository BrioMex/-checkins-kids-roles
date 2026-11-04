# Área

App web compartida para roles por área. Incluye modos sencillo y avanzado, Google Auth, miembros autorizados, coordinación por área, actualización con Supabase Realtime y PWA.

**Configuración paso a paso:** [public\CONFIGURAR.md](public/CONFIGURAR.md).

```powershell
Set-Location app
npm ci
Copy-Item .env.example .env.local
# Completa las dos variables públicas de Supabase.
npm run dev
```

Sin Supabase configurado aparece la guía de activación. No hay un modo local que simule persistencia compartida ni usuarios ficticios en esta versión. El diseño anterior permanece independiente en `prototipo`.

## Estructura

- `src`: cliente TypeScript, interfaz y lector local del Excel.
- `supabase\migrations`: esquema, funciones transaccionales y políticas RLS.
- `public`: manifiesto, iconos y guía.
- `tests`: SQL en PostgreSQL embebido y navegador con respuestas de Supabase simuladas.
- `dist`: resultado autónomo de `npm run build`, listo para alojamiento estático.

```powershell
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

La fuente reutiliza el CSS del prototipo mediante una importación; conserva ambas carpetas al compilar. El paquete `dist` no depende de la carpeta `prototipo`.

La publicación automática en GitHub Pages está en `..\.github\workflows\pages.yml`: cada push a `main` instala dependencias, ejecuta las pruebas y publica solo `app\dist`. La raíz del repositorio debe contener `app` y `prototipo`. Configura las dos variables públicas de Supabase en GitHub y selecciona **GitHub Actions** como origen de Pages; el paso 7 de la guía detalla la primera conexión y las actualizaciones.

Para compilar manualmente el repositorio `BrioMex/-checkins-kids-roles`, usa `npm run build -- --base=/-checkins-kids-roles/`. El workflow detecta la ruta automáticamente.

**Imprimir rol:** permite elegir el día seleccionado o todos los días, con una hoja por fecha. Cada área tiene una tabla de puestos (filas) frente a todos los horarios de servicio (columnas). Conserva los filtros de área, nombre, pendientes y Mi participación; omite fechas sin coincidencias. Incluye notas y reduce el contenido si hace falta para ajustar cada día a Carta; con muchos puestos o notas la letra puede quedar pequeña.

**Configuración externa necesaria:** proyecto Supabase, Google habilitado, migraciones aplicadas, primer administrador autorizado y publicación bajo HTTPS. Las pruebas locales no validan tus credenciales, tu proyecto alojado ni Safari en un teléfono real.

La regla de una persona por servicio se comprueba en cliente y servidor. El Excel original tiene un conflicto el **15 de noviembre de 2026 a las 09:00**, entre **Check-in 1 y Maestro/a de Preteens**, fila 13 de ambas hojas. La importación lo muestra y se detiene antes de enviar datos; corrige una copia antes de importar. Los originales no se modificaron.
