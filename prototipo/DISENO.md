# Área · Un equipo, un propósito

## Abrir el prototipo

Abre `index.html` con doble clic. No necesitas instalar nada, registrarte ni contratar servicios.

Para usar un origen local estable y probar la actualización entre pestañas, desde esta carpeta:

```powershell
npm start
```

Abre `http://127.0.0.1:4173`. Detén el servidor con Ctrl+C. El servidor escucha únicamente en esta computadora.

El prototipo utiliza nombres ficticios y no importa datos personales del Excel. No modifica los archivos originales. Las ediciones se guardan en el almacenamiento del navegador; no se comparten entre dispositivos. Borrar los datos del navegador elimina la demo. Abrir el archivo directamente y abrirlo por HTTP utilizan almacenamientos diferentes.

## Propuesta de experiencia

Una app web instalable (PWA) en español para Android, iPhone, iPad, Windows, macOS y Linux. Una sola dirección y una sola base de datos; no cinco aplicaciones distintas. En iOS se agregaría a la pantalla de inicio desde el menú de compartir; en otros dispositivos la instalación depende del navegador. La consulta en navegador será siempre la opción común.

Identidad visual: tonos naturales, verde olivo, superficies claras, títulos editoriales y un color por área. La información se agrupa por domingo y servicio. Las personas y los puestos tienen prioridad sobre la configuración. Las áreas llevan texto e icono además de color.

| Vista | Experiencia |
|---|---|
| Roles por área | Fecha, servicio, filtros y cobertura. Tarjetas en modo sencillo; tabla con notas en avanzado. |
| Mi participación | Solo los puestos de la persona conectada. La demo simula a Diego Luna. |
| Voluntarios | Directorio por área y estado. En la demo se pueden añadir personas ficticias como administrador. |
| Actividad | Cambios recientes. En producción: quién, cuándo, valor anterior y nuevo. |
| Configuración | Servicios, puestos, periodo, áreas y permisos. En la demo explica la propuesta; no cambia esos parámetros. |

El modo sencillo permite consultar y asignar sin manejar tablas complejas. El modo avanzado muestra todos los detalles; la versión final añadirá configuración de periodos, puestos y servicios. Cambiar de modo no cambia permisos ni duplica los datos.

En móvil, la navegación baja a una barra inferior y las tarjetas se apilan. En computadora se utiliza una barra lateral. Los formularios tienen etiquetas, errores explícitos, cierre con Escape y foco delimitado en el diálogo. Se respeta la preferencia de movimiento reducido. La impresión elimina los controles y utiliza la fecha, servicio y filtros seleccionados.

## Qué se recuperó del Excel

Se revisó `Rol_x_area.xlsx`, incluidas sus ocho hojas y el Office Script almacenado como texto en la hoja `Office Script`. El script no se ejecutó. El otro Excel y el PDF no se modificaron ni se importaron.

- Áreas: Babies, Kinder, Kids, Preteens y Check-in.
- Voluntarios activos, pertenencia a una o varias áreas y elegibilidad para las listas de asignación.
- Puestos activos de las primeras cuatro áreas: Maestro/a, Ayuda y Asistente 1.
- Puestos activos de Check-in: Check-in 1 y Check-in 2.
- Servicios dominicales activos: Primero 09:00, Segundo 10:40 y Tercero 12:25.
- Servicios sabatinos existentes pero inactivos; no aparecen en la agenda de demostración.
- Fecha inicial, periodo trimestral, notas y resumen por fecha.
- Al regenerar, conservar las asignaciones existentes por fecha, servicio y puesto.

El script organiza hojas y listas; no es un algoritmo de reparto equitativo de voluntarios. La propuesta no presupone asignación automática. Tampoco copia sus mecanismos internos de fechas: la app final generará ocurrencias desde el día de cada servicio, sin depender de un sábado de referencia.

El prototipo trae nueve domingos ficticios desde noviembre de 2026 para recorrer la interfaz. La demo no es una importación fiel del calendario ni de los nombres del libro.

## Perfiles

| Perfil | Consultar | Editar |
|---|---|---|
| Administrador | Todas las áreas | Voluntarios, asignaciones, servicios, puestos y permisos |
| Coordinador | Agenda de todas las áreas | Asignaciones de sus áreas; sin administrar accesos ni otras áreas |
| Voluntario | Agenda y participaciones propias | Sin edición |

En el prototipo, el selector de perfil es una **simulación pública**, no autenticación. La coordinación corresponde a Kinder y el voluntario de ejemplo es Diego. En la app final, estos permisos se impondrán en la base de datos, no solo ocultando botones.

Los teléfonos y correos no deben aparecer en la agenda general ni ser necesarios para consultar un rol. Se propone no recopilar datos de menores, fotografías ni información sensible. La pertenencia de un voluntario a un área y su puesto en un servicio son conceptos distintos.

## Arquitectura recomendada para la app final

```text
Navegador / PWA
    | HTTPS + sesión individual
    v
Supabase Auth  ----  PostgreSQL con RLS
                         |
                    Supabase Realtime
                         |
                Otros usuarios conectados
```

Frontend estático en Cloudflare Pages Free, con subdominio gratuito `pages.dev`. Supabase Free como base de datos, autenticación y suscripción a cambios. No hacen falta servidores propios ni funciones de pago para este volumen.

Para la implementación productiva, se propone React + TypeScript con Vite y el cliente oficial de Supabase. Este prototipo deliberadamente no instala ese entorno: es HTML, CSS y JavaScript sin dependencias de ejecución, fácil de abrir y revisar antes de elegir la implementación final.

### Persistencia y cambios simultáneos

- La base de datos compartida será la fuente de verdad. El almacenamiento local no será el respaldo principal.
- Tras confirmar una transacción, Realtime notificará a los clientes autorizados; estos volverán a consultar los datos afectados.
- Al reconectar o volver a la aplicación se recargará la agenda, aunque se hayan perdido notificaciones.
- Actualizaciones con versión esperada; si otra persona modificó el registro, se mostrará el conflicto antes de sobrescribir.
- Transacción y restricción de unicidad para impedir que una persona ocupe dos puestos del mismo servicio.
- Sin conexión: consulta de la última agenda descargada, claramente marcada con fecha. Edición desactivada en la primera versión para evitar prometer una sincronización que pueda perder cambios.
- Historial de modificaciones generado en el servidor, no con nombres enviados por el cliente.
- Exportación periódica por administración y prueba de recuperación.

La demo solo guarda localmente, actualiza otras pestañas del mismo origen mediante el evento `storage` y detecta cambios de versión antes de guardar. No ofrece transacciones entre pestañas: dos escrituras exactamente simultáneas podrían competir. La solución real requiere la transacción en PostgreSQL.

### Modelo de datos propuesto

| Entidad | Información principal |
|---|---|
| Comunidades y membresías | Espacio compartido, usuario autenticado y perfil |
| Áreas y coordinaciones | Área y usuarios autorizados a coordinarla |
| Voluntarios y pertenencias | Persona, estado activo y áreas; vínculo opcional con cuenta |
| Plantillas de servicio | Día de semana, hora local, nombre y estado |
| Ocurrencias de servicio | Fecha, hora y plantilla; identificador estable |
| Puestos por área | Nombre, orden y estado; Check-in usa su propia lista |
| Asignaciones | Ocurrencia, área, puesto, voluntario opcional, nota y versión |
| Historial | Usuario real, registro, operación, valores y fecha del servidor |

Índice único por ocurrencia, área y puesto. Índice único parcial por ocurrencia y voluntario cuando no sea nulo. La validación en servidor verifica estado y pertenencia del voluntario. Las fechas se almacenan como fecha local y el espacio tendrá una zona horaria IANA elegida al configurarlo; no se deducirá de la computadora del usuario.

La generación trimestral creará solo lo que falta y nunca borrará puestos cubiertos. Si se desactiva un puesto o servicio con asignaciones, se pedirá una revisión explícita. Los periodos y servicios configurables no están implementados en la demo.

### Acceso sin costos de correo

Propuesta inicial: Google OAuth con Supabase Auth y acceso limitado a miembros autorizados. No depende de enviar un correo por cada acceso ni de SMS. Tener una cuenta autenticada no bastará para leer datos: RLS exigirá una membresía autorizada. El rol de administrador no podrá autoasignarse desde el navegador.

Si se prefiere acceso por correo y contraseña o enlace mágico, hay que resolver el proveedor SMTP: el servicio integrado de Supabase tiene restricciones y un límite anunciado de 2 correos/hora. No se debe presentar ese envío integrado como solución de producción para los diez usuarios.

Las claves secretas y `service_role` nunca estarán en el frontend. Las suscripciones y lecturas respetarán RLS. El alta del primer administrador y las invitaciones se resolverán mediante un proceso administrativo controlado.

## Presupuesto gratuito y límites

Fuentes oficiales consultadas al elaborar la propuesta:

| Servicio | Plan propuesto | Datos relevantes |
|---|---|---|
| Supabase | Free, $0 USD/mes | 500 MB de base de datos, 50.000 usuarios activos/mes, 5 GB de transferencia y 1 GB de archivos |
| Cloudflare Pages | Free | Sitio estático, subdominio gratuito; 500 compilaciones/mes y hasta 20.000 archivos |

Para unas diez personas que consultan y editan roles de texto, estos límites deberían ser suficientes. El número de usuarios por sí solo no garantiza el consumo: también influyen las consultas, frecuencia de actualización, historial y archivos. No se propone almacenar fotos ni documentos, contratar dominio, añadir SMS, usar funciones de pago ni habilitar planes de pago.

**Límites importantes:** Supabase Free puede pausar proyectos tras una semana sin actividad; no incluye respaldos automáticos ni garantías de disponibilidad. Una app usada solo ocasionalmente podría requerir reactivar el proyecto. El plan gratuito no equivale a servicio ilimitado o perpetuo. Si una cuota se agota, se debe aceptar la restricción y revisar el consumo; nunca activar una ampliación de pago sin autorización. Revisar también que la organización y el alojamiento permanezcan en Free.

El objetivo de costo es **$0 bajo los planes gratuitos y sus condiciones vigentes**, no una garantía de que un tercero nunca cambiará precios. No se ha creado ninguna cuenta, activado facturación, publicado contenido ni contratado servicio.

Referencias:

- [Supabase: precios y límites](https://supabase.com/pricing)
- [Supabase Auth: límites de solicitudes y correo](https://supabase.com/docs/guides/auth/rate-limits)
- [Cloudflare Pages: límites del plan Free](https://developers.cloudflare.com/pages/platform/limits/)

## Qué puedes probar ahora

Cambiar fecha y servicio; filtrar áreas; buscar voluntarios; ver pendientes; cambiar entre sencillo y avanzado; asignar o liberar un puesto; añadir notas; detectar una persona duplicada en el mismo servicio; simular perfiles; añadir voluntarios ficticios; consultar el historial; imprimir y exportar JSON. Las ediciones sobreviven a la recarga si el navegador permite almacenamiento local.

No implementado: cuentas reales, importación de Excel, sincronización entre dispositivos, notificaciones, instalación PWA, gestión editable de servicios y puestos, recuperación de respaldos ni reparto automático. El botón de exportación descarga datos de la demo, no un Excel. El modo sencillo/avanzado y el perfil seleccionado se reinician al recargar; las asignaciones y voluntarios guardados se conservan.

## Validación técnica

Se incluyen pruebas del modelo y pruebas de navegador para escritorio y móvil. Las dependencias son solo para esas pruebas; no se descargan al abrir el prototipo.

```powershell
npm install
npm test
npx playwright install chromium
npm run test:ui
```

Las capturas de escritorio y móvil se generan en `test-results`. La configuración de pruebas inicia y detiene su propio servidor local en el puerto 4173; no requiere dejar servicios en segundo plano.

## Siguiente etapa, después de aprobar el diseño

Conectar autenticación, membresías y RLS; importar el Excel mediante una previsualización revisable; implementar transacciones y Realtime; añadir gestión de servicios y generación trimestral; publicar la PWA bajo HTTPS; probar con dos usuarios reales en dispositivos distintos y restaurar un respaldo de prueba. Hasta completar eso, no debe usarse como agenda oficial del equipo.
