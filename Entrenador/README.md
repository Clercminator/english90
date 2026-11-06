# English 90 Trainer — candidato v1.0

Trainer de TypeScript/Vite con rutas hash y progreso local. La rama comercial añade compra única, cuenta y entrega protegida; conserva los ejercicios públicos y el flujo editorial privado. **Ventas desactivadas por defecto. No se ha aprobado una salida comercial.** Las secciones históricas del candidato v1.0 documentan la versión anterior; el estado comercial actual está al final.

## Desarrollo y verificación

Node.js 24 o posterior. Instalar dependencias con `npm ci`. La verificación completa del mantenedor requiere conservar `private/source/English_90_V2_Programa.json` localmente: permite contrastar el vocabulario original y detectar filtraciones de prosa privada. Ese archivo y el PDF nunca se suben al repositorio público ni al hosting. El build falla si falta la fuente de esa auditoría; no omitirla para publicar.

```sh
npm run dev
npm run build
npm run lint
npm test
npx playwright test --workers=2
npm run prepare:git
npm run preview
```

Playwright necesita sus navegadores (`npx playwright install chromium firefox webkit`). Cerrar la vista previa en el puerto 4173 antes de ejecutar los tests. Los tests PDF y las herramientas de entrega de pedidos son utilidades privadas del mantenedor, fuera del repositorio público.

## Práctica diaria y compatibilidad

`Entrenador/daily.ts` selecciona hasta diez tarjetas: hasta cinco repasos pendientes, refuerzo opcional de tarjetas difíciles y hasta cinco nuevas; completa huecos con las disponibles. No repite un enunciado en la misma cola. Las tarjetas pendientes se ordenan con `dueWords`; cada calificación usa exclusivamente `schedule`, sin un calendario alternativo.

La clave sigue siendo `english90-v2-progress-2`, con esquema 2. `daily` y `practiceTests` son campos opcionales validados; no se cambian los IDs del vocabulario, los intervalos ni registros antiguos. Los respaldos anteriores siguen siendo válidos. La sesión guarda cada calificación, puede reanudarse y conserva las tarjetas ya completadas al reorganizar. Las sesiones nuevas añaden tres ejercicios según la dificultad elegida: reconocimiento con opciones, recuperación escrita o estructuras complejas con lectura. La sesión conserva esa elección aunque después se cambien las preferencias. Los ejercicios y respuestas se guardan al comprobarlos. La recapitulación permite un repaso de errores sin modificar el resultado original. El historial separa la autoevaluación de tarjetas y los ejercicios; las respuestas con opciones no suman recuerdo escrito independiente. Las sesiones antiguas sin esta etapa siguen siendo compatibles.

Los cambios diarios se serializan mediante Web Locks cuando está disponible; además se actualiza el estado local antes de aplicar una calificación y se comprueba el número de repasos previo. En navegadores sin Web Locks se conserva la comprobación antes de escribir, aunque localStorage no ofrece transacciones entre pestañas. El guardado rechazado o corrupto se comunica sin sobrescribir el original. Exportar/importar sigue disponible desde Mi progreso; no hay sincronización entre dispositivos.

La racha usa fechas locales y actividad de aprendizaje. Abrir Inicio, revelar una tarjeta, guardar un borrador o copiar un mensaje para IA no suma actividad. Una tarjeta calificada, una ronda terminada o un test enviado sí cuentan. Los registros históricos de actividad se conservan tal como estaban: no se reconstruyen retroactivamente.

## Publicación mediante Git

Repositorio: `https://github.com/Clercminator/english90`. Se encontró vacío antes de este primer commit. Incluye código público y `dist/` ya compilado y auditado. El currículo, PDF, pedidos, credenciales, archivos administrativos, cachés y reportes de pruebas permanecen fuera de Git.

Después del build y las pruebas, `npm run prepare:git` genera la configuración de Vercel para servir exclusivamente `dist/`, sin instalación ni compilación remotas. Se conservan las rutas estáticas, cabeceras y respuestas 404 del despliegue anterior. Hacer commit de fuentes, `dist/` y `vercel.json`. El push a `main` activa la integración Git y despliega esos bytes: requiere autorización explícita de publicación. El candidato v1.0 se prepara localmente, sin push ni despliegue automático. Verificar el estado del commit y el contenido servido en `https://english90.imrtech.xyz` antes de dar la publicación por terminada. No publicar la raíz del workspace ni cambiar DNS.

`npm run prepare:vercel` y `npm run package:public` conservan la preparación aislada y el ZIP público como alternativas de entrega. Solo contienen archivos admitidos por la auditoría.

## Premium y datos de contacto

La ficha comercial local confirma un programa autoguiado de 90 días, manual digital, lecciones, lecturas, diálogos y ejercicios. Se presenta esa diferencia respecto de la práctica gratuita, sin distribuir el material privado. El precio de la ficha es solo de referencia y no se publica como una oferta vigente.

Pendiente para habilitar una venta futura: precio vigente confirmado, disponibilidad y condiciones concretas de entrega/cambios, y destino de compra verificado. El canal de consulta actual es el WhatsApp publicado por IMR Tech, configurado en `site.config.json`; no se inventó un correo. `legalReviewed` permanece desactivado: la redacción técnica de los avisos no acredita una revisión jurídica.

La publicidad sigue desactivada. Los tests históricos de consentimiento se ejecutan con respuestas simuladas; no activan proveedores. El archivo `archive/commercial-v3.1/public-pages.mjs` se conserva exclusivamente como fixture de regresión de las barreras del antiguo checkout y no se compila ni se sirve.


## Alcance y auditoría de v1.0 (30 de octubre de 2026)

Se reutilizan los 782 términos / 791 pares de vocabulario, 72 ejercicios de frases, cuatro tests gratuitos originales, búsqueda, repaso de errores, temporizador, animaciones, calendario, respaldo, pantalla de regreso y prompts externos. Se añaden 24 frases originales (96 en total) y 12 lecturas con tres versiones de dificultad y 72 preguntas de comprensión. No se añaden dependencias ni servicios. El número de paquete 1.0.0 identifica el primer producto congelable; V2/V3 en nombres históricos describen las iteraciones anteriores, no versiones del respaldo.

Paso a paso, Consolidación y Desafío se pueden elegir desde Inicio, práctica diaria, vocabulario, juegos, tests y práctica oral/IA. Cambian las ayudas, la complejidad del texto y las tareas; no equivalen a niveles certificados. Los tests cubren las 12 situaciones en las tres dificultades, con cuatro preguntas por ronda y borradores separados. Reutilizan ejercicios: no son 36 exámenes independientes. Las tareas de escritura y argumentación son abiertas, sin corrección automática. El Trainer permite practicar hacia B2, pero no constituye un currículo completo de cero a B2 validado ni acredita competencia conversacional.

Los temas Claro, Oscuro y Sistema están disponibles en la cabecera del Trainer y las páginas informativas. La elección se guarda localmente y sigue los cambios del sistema cuando corresponde. No modifica el respaldo de aprendizaje.

`learning.ts` registra intentos escritos independientes por expresión y fecha local. Las repeticiones inmediatas, rondas de errores, respuestas con opciones y respuestas reveladas no aumentan este registro. Los errores persistentes tienen prioridad; después se eligen expresiones no practicadas o más antiguas. Diez intentos con al menos 80% de aciertos generan una sugerencia de práctica más exigente, sin cambiar la dificultad elegida ni asignar un nivel lingüístico. La secuencia normal deja las estructuras adelantadas para Desafío; todos los ejercicios siguen accesibles. La pantalla de progreso distingue tarjetas autoevaluadas, respuestas escritas y práctica oral sin puntuación. Los logros se derivan de actividad guardada y pueden compartirse como texto sin notas ni respuestas personales.

`audio.ts` utiliza únicamente voces locales en inglés mediante Speech Synthesis. Ofrece repetición normal/lenta, cancelación al salir, aviso de errores y alternativa escrita. No usa micrófono ni reconocimiento; no mide pronunciación. Sin voz inglesa local, o con audio desactivado, la escucha continúa como lectura asistida y no suma un acierto de escucha. El interruptor de audio está en Mi progreso. La animación sigue la preferencia de movimiento reducido del sistema. Las tres situaciones orales reutilizan expresiones gratuitas de presentación, café y viajes; no copian diálogos privados.

`guide-map.json` es un índice público de metadatos: día, semana, tema, IDs de vocabulario y de ejercicios existentes. No contiene explicaciones, lecturas, tareas, diálogos ni claves Premium. Se contrastó con el JSON actual: 90 días, 72 lecciones, 12 evaluaciones semanales y seis proyectos. El día 18 conduce a seis expresiones y dos ejercicios sobre aficiones. Cuando no existe un ejercicio de frases suficientemente relacionado, se ofrece solo vocabulario; no se inventa una equivalencia. Los enlaces de día mantienen la selección al reanudar la actividad.

El PDF tiene 168 páginas. Sus 48 preguntas semanales aparecen en el JSON y en el texto extraído del PDF. Los puntos de control están en las páginas 62 (día 30) y 113 (día 60); no se confunden con los cuatro tests gratuitos. La página 160 remite a un examen final que sigue ausente, junto con su clave. Falta crear y revisar editorialmente ese instrumento, sus respuestas y criterios de corrección antes de prometer una evaluación completa del día 90. El Trainer y Premium informan de esta limitación. También se observan marcas editoriales literales como `<b>Comprensión:</b>` y etiquetas duplicadas de interlocutor en la página 62 del PDF; no se modificó el archivo comercial.

Correcciones de contenido: la pregunta comparativa ahora incluye «than the other one»; se acotan dos enunciados modales ambiguos; los tests admiten alternativas válidas como «have to», «need to», «repeat», «can» y «might» en sus contextos. Las comprobaciones admiten contracciones comunes y variantes como centre/center y travelling/traveling, conservando tiempo verbal y negación. Se conserva el vocabulario original y sus variantes regionales; la comparación automática no pretende abarcar todas las paráfrasis posibles.

El paquete público se verifica por lista de archivos permitidos y detección de PDF, prosa Premium, estructuras del currículo, mapas de fuentes, archivos comprimidos y patrones de credenciales. El índice de acompañamiento y el contenido gratuito son públicos intencionalmente. El presupuesto comprimido de JS/CSS pasa de 60 a 75 kB para incluir las lecturas originales, ejercicios y temas; el candidato ocupa 70.371 bytes, sin librerías de ejecución nuevas. `npm run package:public` produce `release/English_90_Trainer_V1.0_Public.zip` con comprobación de bytes contra `dist/`.

### Validación del candidato

- Línea base verificada antes de ampliar: 44 tests unitarios y 105 tests de navegador.
- `npm run build`: validación del contenido, TypeScript, Vite y auditoría pública correctas; 19 archivos públicos.
- `npm run lint` y `git diff --check`: correctos.
- `npm test`: 54 pruebas aprobadas.
- `npm run test:pdf`: tres pruebas aprobadas; validan herramientas de entrega y protección, no una certificación educativa.
- `npx playwright test --workers=2`: 138 pruebas aprobadas en Chromium, Firefox y WebKit móvil; incluye axe WCAG A/AA, navegación por teclado, movimiento reducido, almacenamiento, recuperación, guía, escucha simulada, alternativa sin audio, dificultades y temas. Se revisaron capturas móviles y se corrigió el contraste de etiquetas en WebKit oscuro.
- Tras ajustar el estilo de respaldo sin JavaScript, se repitieron las 54 pruebas unitarias y 21 pruebas de navegador de temas, dificultad y páginas sin JavaScript: todas aprobadas. Las comprobaciones oscuras cubren 15 pantallas por navegador.
- `npm run check:public`, `npm run prepare:git` y `npm run package:public`: correctos. ZIP contrastado byte a byte con los 19 archivos de `dist/`.
- Comprobación de producción por HTTP: seguía sirviendo `main-B0DHohpc.js`, anterior al candidato local `main-h_E7U64U.js`. No se ejecutó push ni despliegue.

### Acciones que requieren revisión humana

1. En un iPhone y un Android reales, abrir Escuchar y escribir, comprobar voz inglesa normal/lenta, interrupción al navegar y vuelta tras bloquear la pantalla. Repetir con una voz inglesa no instalada y con audio desactivado. La simulación del navegador comprueba el flujo, no la calidad acústica del sistema operativo.
2. Completar la revisión editorial del examen final y la clave antes de anunciar ese componente de la guía. Las tarjetas y tests gratuitos funcionan sin él; no generan un resultado oficial.
3. Autorizar la publicación del candidato; solo entonces ejecutar el proceso de push/despliegue y verificar el dominio. Hasta ese paso, producción continúa con la versión anterior.

## Operación comercial — 6 de noviembre de 2026

### Arquitectura y límites

`Entrenador/commerce.ts` y `commerce.css` implementan `/comprar/`, `/premium/`, `/cuenta/`, `/pago/` y sus equivalentes hash. El Trainer conserva `/#/home`, ejercicios y localStorage. La portada WebP se extrajo de la edición privada de referencia, sin publicar el PDF; se etiqueta como referencia, no como edición final aprobada. No hay testimonios ni interfaces simuladas.

`api/commerce.py` delega en `server/commerce.py`: Checkout Pro **Orders API** (`POST /v1/orders`, `processing_mode=manual`, `config.online.*_url`), verificación independiente, cuenta, cifrado PDF, Storage privado y Resend. El precio único de 59.990 CLP se fija en servidor y base de datos. El SDK de Auth se carga solo cuando se abre una vista comercial configurada.

La migración `supabase/migrations/20261106061830_commerce.sql` añade productos, perfiles, pedidos, eventos, permisos, entregas y límites durables. Sus RPC privilegiados solo son ejecutables por `service_role`. Los clientes solo pueden leer columnas autorizadas de filas propias; contraseñas cifradas, enlaces, correos y eventos de pago no están expuestos. Ninguna política de Storage permite descargas públicas. La cuenta se vincula por la identidad verificada en Auth, nunca por metadatos editables ni por el correo enviado por el navegador.

La confirmación verificada crea un permiso y una entrega dentro de una transacción. El webhook intenta completar la entrega de forma síncrona. La cola persiste en PostgreSQL, usa leases de diez minutos, y reintenta después de errores. Los eventos repetidos y las revisiones antiguas no duplican permisos ni entregas. Reembolsos parciales/totales y contracargos revocan el permiso de ese pedido; la reversión queda bloqueada hasta revisión del titular. Otras compras activas del usuario se conservan.

La práctica existente sigue siendo pública. `VITE_PREMIUM_GUARD=true` añade una comprobación de cuenta a las rutas de acompañamiento `guide` y `plan`; **este guard visual no convierte los ejercicios que ya son públicos en contenido secreto**. El PDF, su contraseña y las descargas siempre se autorizan en el servidor. Los futuros contenidos exclusivos necesitarán un endpoint autorizado. No se activa el guard antes de aceptar el recorrido sandbox.

### Endpoints

Todos usan `/api/commerce?action=…`. `GET config` solo devuelve configuración pública; `POST checkout` inicia un intento idempotente; `POST mp-webhook` valida HMAC y consulta el pedido; `POST email-webhook` valida Svix sobre el cuerpo original; `POST status` requiere la capacidad aleatoria guardada en sessionStorage. Perder esa capacidad no pierde la compra: se recupera desde la cuenta.

`POST login` envía un enlace de Supabase; `POST account`, `download` y `password` requieren un bearer verificado mediante `/auth/v1/user`. `GET/POST operations` exige `Authorization: Bearer CRON_SECRET`, reconcilia pagos y procesa trabajos. No entrega PDFs grandes a través de Vercel: emite enlaces de Storage de cinco minutos; el correo incluye uno de 24 horas.

### Configuración y checklist de activación (en orden)

1. **Elegir un entorno de prueba aislado.** Se inspeccionó el proyecto Supabase `English90` (`dkkhjcngxuyxjnisemyc`): sin tablas públicas en ese momento. No se ejecutó ninguna migración remota. Elegir explícitamente proyecto/branch de prueba antes de aplicar la migración y revisar los asesores de seguridad. El test local usa PostgreSQL PGlite con esquemas Auth/Storage de prueba; no sustituye Supabase real.
2. **Configurar Supabase.** Aplicar la migración; mantener ambos buckets privados. Activar email Auth, confirmación de correo y Secure Email Change; desactivar usuarios anónimos. Registrar el origen HTTPS exacto de Preview y `/cuenta/` como retorno permitido. Configurar SMTP propio con Resend, plantilla de enlace mágico y límites de autenticación; comprobar activación, acceso de usuario existente y enlace vencido. Los endpoints Auth directos también requieren los límites propios de Supabase.
3. **Aprobar la edición de entrega.** Revisar el PDF mediante el flujo editorial existente; no regenerarlo por esta integración. Subir el archivo aprobado a `english90-master/approved/english90.pdf`. Fijar `MASTER_PDF_PATH`, `GUIDE_VERSION` y SHA-256 exacto. El archivo sigue fuera de Git y de `dist`. Las pruebas comerciales usan un PDF mínimo generado en memoria y claramente ficticio.
4. **Configurar Mercado Pago Chile.** Obtener credenciales de prueba de la aplicación correcta y su ID de vendedor/aplicación; nunca usar el antiguo enlace genérico. Registrar el webhook HTTPS `…/api/commerce?action=mp-webhook`, tópico `order`, y guardar su secreto. Comprobar notificaciones de aprobación, reembolso y `order.charged_back`. Las credenciales `TEST-` y IDs `ORDTST` se exigen en sandbox. Usar las tarjetas de prueba y el recorrido vigente de Mercado Pago; las pruebas actuales se realizan sin iniciar sesión, en incógnito. No se ha realizado una transacción real ni sandbox del proveedor.
5. **Configurar Resend y soporte.** Verificar un dominio emisor real y sus registros SPF y DKIM; publicar DMARC conforme a la política del dominio y verificar alineación. Definir `RESEND_FROM` y un `SUPPORT_EMAIL` real; actualizar también `site.config.json.contactEmail` si corresponde. Registrar el webhook `…?action=email-webhook` para `email.sent`, `email.delivered`, `email.bounced`, `email.failed` y `email.delivery_delayed`, con secreto Svix. `sent` significa aceptación del proveedor; solo su evento firmado confirma `delivered`. No se rastrea lectura ni apertura.
6. **Configurar Vercel Preview.** Proyecto existente `english90-trainer`, Node 24/Python 3.12. Usar los nombres de `.env.example`, valores separados por entorno y ningún secreto con prefijo `VITE_`. Crear 32 bytes aleatorios para `PDF_SECRET_KEY`, codificados en base64; custodiar y respaldar esta clave por separado. Perderla impide recuperar las contraseñas. Cambiarla requiere recifrar primero los registros existentes. `SITE_URL` debe ser el origen HTTPS exacto del despliegue que recibirá al comprador. La integración aún necesita validación del runtime Linux y sus tiempos reales; se comprobó disponibilidad de wheels Linux x86_64 de las dependencias nativas.
7. **Activar recuperación frecuente.** Guardar `english90_site_url` y `english90_cron_secret` en Supabase Vault mediante el panel del titular y ejecutar `supabase/schedule-commerce.sql` en el entorno elegido. Programa una llamada autenticada cada cinco minutos usando pg_cron/pg_net. Revisar historial del job y respuestas HTTP, sin imprimir secretos. Las vistas previas protegidas requieren acceso permitido para webhooks/scheduler; no quitar protección de producción para probar. El cron diario de Vercel es una salvaguarda, no reemplaza este scheduler. Marcar `FULFILLMENT_SCHEDULER_READY=true` solo después de comprobarlo.
8. **Revisión comercial/legal y fiscal.** Validar identificación fiscal y domicilio del vendedor, canal de soporte, conservación y derechos de datos, entrega, condiciones de práctica, retracto y reembolsos. Las páginas son borradores editables en `scripts/public-pages.mjs` y no una revisión legal. Confirmar emisión de boleta/factura y obligaciones chilenas: Mercado Pago no las resuelve por esta integración. No se implementa emisión fiscal. Después actualizar `site.config.json.legalReviewed` y `LEGAL_APPROVED=true` en el entorno correspondiente.
9. **Prueba completa en sandbox.** Activar el producto en `products`, `MASTER_PDF_APPROVED=true`, `COMMERCE_ENABLED=true`, manteniendo `COMMERCE_ENV=sandbox` y `LIVE_SALES_APPROVED=false`. Comprar por 59.990 CLP; comprobar pedido acreditado, un permiso y una entrega; abrir el correo, activar cuenta, descargar PDF y obtener su contraseña desde la cuenta. Repetir con usuario existente, pago pendiente/rechazado, firma falsa, webhook repetido y fuera de orden, reembolso/contracargo, correo rechazado y fallo temporal de Storage/Resend. Probar acceso cruzado con dos usuarios usando el Data API y Storage reales. Reenviar el webhook y confirmar que no se cobra ni envía otra entrega. Conservar evidencia del proveedor y del scheduler, sin secretos.
10. **Autorizar producción por separado.** Solo después de aceptar lo anterior: credenciales y secretos de producción aislados, producto y guía aprobados, `COMMERCE_ENV=production`, `LIVE_SALES_APPROVED=true` y entorno Vercel `production`. No publicar, cambiar el dominio ni activar cargos sin autorización explícita. Para que `/` muestre la venta, compilar con `VITE_COMMERCE_LANDING=true`; `/#/home` sigue siendo el Trainer. El guard de práctica se decide y prueba aparte. Compilar, auditar y preparar la configuración antes del despliegue.

### Recuperación y trazabilidad

Inspeccionar `orders`, `payment_events`, `entitlements`, `guide_deliveries` y `email_events` desde el panel autorizado. No exportar `password_ciphertext` ni el cuerpo del correo a registros o soporte. El cifrado es AES-GCM con el pedido como dato autenticado; cada PDF usa contraseña aleatoria independiente y AES-256/R6 con contraseña de propietario diferente.

Con variables de entorno cargadas de forma segura:

```sh
python scripts/commerce-ops.py inspect --order UUID_INTERNO
python scripts/commerce-ops.py retry --order UUID_INTERNO
python scripts/commerce-ops.py resend --order UUID_INTERNO
python scripts/commerce-ops.py run
```

`retry` conserva el mismo archivo, contraseña y clave idempotente del envío. `resend` permite un nuevo envío solo tras un fallo/rebote confirmado con ID de proveedor; revisar primero la dirección y el evento. No modifica el correo de la compra ni crea otro cobro. Resend conserva claves idempotentes 24 horas: un resultado ambiguo de más de 23 horas se detiene con `email_outcome_requires_review`. El titular debe reconciliarlo en Resend; no borrar la evidencia para forzar un reenvío. Los enlaces mágicos vencidos se recuperan desde `/cuenta/`. Cerrar sesión conserva el progreso local.

Las reversiones no retiran copias ya descargadas ni invalidan inmediatamente enlaces firmados emitidos antes de la reversión. La contraseña limita la apertura; no impide compartir contenido a un destinatario autorizado. Una interrupción entre upload y registro puede dejar un objeto privado huérfano, que requiere limpieza operativa posterior. Monitorizar fallos y tiempos del worker; su capacidad inicial es pequeña (dos reconciliaciones y una entrega por ejecución), apropiada para el lanzamiento, con necesidad de ajustar frecuencia/capacidad al volumen real.

### Verificación del código

```sh
npm ci
python -m pip install -r requirements.txt
npm run lint
npm run typecheck
npm test
npm run test:commerce
npm run test:pdf
npm run build
npm run prepare:git
npx playwright test --workers=2
```

El servidor estático de `npm run preview` no ejecuta Python. Para desarrollo del API se puede ejecutar `python scripts/serve-commerce.py` y activar `ENGLISH90_LOCAL_API=true` en el preview; las mutaciones siguen exigiendo un origen HTTPS autorizado, por lo que el recorrido sandbox completo necesita un túnel o Preview HTTPS. `prepare:vercel` sigue creando un archivo estático histórico: **no usar ese paquete para desplegar la función comercial**. El despliegue comercial debe incluir `api`, `server`, `requirements.txt`, `.python-version`, `vercel.json` y el `dist` auditado. No subir `private/`, archivos de entorno ni PDFs.

Estado: componentes implementados y verificados localmente; integración Mercado Pago/Supabase/Resend y aceptación final de Vercel pendientes. No se han configurado credenciales remotas, activado ventas, modificado precios ni desplegado producción. La siguiente fase del producto se limita a completar la edición aprobada del examen final y mejorar la práctica a partir de uso real; no se añaden juegos ni un tutor en esta entrega.

La prueba del sistema editorial privado existente (`npm run test:pdf`) dio 18/20: fallan dos expectativas de cantidad de enlaces internos (21 y 241 frente a 148). Esos archivos editoriales no se modificaron en esta implementación; la protección comercial tiene pruebas independientes aprobadas. Resolver y revisar ese candidato dentro del flujo editorial antes de aprobarlo como master de venta. `npm audit` detectó diez avisos moderados en herramientas de lint/desarrollo; no se aplicó una actualización forzada ajena al alcance.

Referencias oficiales consultadas: [Orders Chile](https://www.mercadopago.cl/developers/es/docs/checkout-pro-orders/create-order), [retornos](https://www.mercadopago.cl/developers/es/docs/checkout-pro-orders/web-integration/configure-back-urls), [notificaciones](https://www.mercadopago.cl/developers/es/docs/checkout-pro-orders/notifications), [contracargos](https://www.mercadopago.cl/developers/es/docs/checkout-pro-orders/chargebacks/notifications), [Auth sin contraseña](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Python en Vercel](https://vercel.com/docs/functions/runtimes/python), [firmas Resend](https://resend.com/docs/webhooks/verify-webhooks-requests), [idempotencia de correo](https://resend.com/docs/dashboard/emails/idempotency-keys).
