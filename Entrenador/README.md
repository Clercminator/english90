# English 90 Trainer — V3.3

Aplicación estática gratuita para hispanohablantes, con TypeScript/Vite, rutas hash y progreso local. Sin backend, cuentas, servicios de analítica, suscripciones ni APIs de IA. La página Premium es informativa y dirige consultas al canal público de IMR Tech; no procesa pagos.

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

La clave sigue siendo `english90-v2-progress-2`, con esquema 2. `daily` es un campo opcional validado; no se cambian los IDs del vocabulario, los intervalos, notas, tests, juegos ni registros antiguos. Los respaldos anteriores siguen siendo válidos. La sesión guarda cada calificación, puede reanudarse y conserva las tarjetas ya completadas al reorganizar. La recapitulación no vuelve a calificarlas. El historial diario usa el tipo de resultado existente y se presenta como autoevaluación.

Los cambios diarios se serializan mediante Web Locks cuando está disponible; además se actualiza el estado local antes de aplicar una calificación y se comprueba el número de repasos previo. En navegadores sin Web Locks se conserva la comprobación antes de escribir, aunque localStorage no ofrece transacciones entre pestañas. El guardado rechazado o corrupto se comunica sin sobrescribir el original. Exportar/importar sigue disponible desde Mi progreso; no hay sincronización entre dispositivos.

La racha usa fechas locales y actividad de aprendizaje. Abrir Inicio, revelar una tarjeta o copiar un mensaje para IA no suma actividad. Los registros históricos de actividad se conservan tal como estaban: no se reconstruyen retroactivamente.

## Publicación mediante Git

Repositorio: `https://github.com/Clercminator/english90`. Se encontró vacío antes de este primer commit. Incluye código público y `dist/` ya compilado y auditado. El currículo, PDF, pedidos, credenciales, archivos administrativos, cachés y reportes de pruebas permanecen fuera de Git.

Después del build y las pruebas, `npm run prepare:git` genera la configuración de Vercel para servir exclusivamente `dist/`, sin instalación ni compilación remotas. Se conservan las rutas estáticas, cabeceras y respuestas 404 del despliegue anterior. Hacer commit de fuentes, `dist/` y `vercel.json`, y push a `main`, para que la integración Git existente despliegue esos bytes. Verificar el estado del commit y el contenido servido en `https://english90.imrtech.xyz` antes de dar la publicación por terminada. No publicar la raíz del workspace ni cambiar DNS.

`npm run prepare:vercel` y `npm run package:public` conservan la preparación aislada y el ZIP público como alternativas de entrega. Solo contienen archivos admitidos por la auditoría.

## Premium y datos de contacto

La ficha comercial local confirma un programa autoguiado de 90 días, manual digital, lecciones, lecturas, diálogos y ejercicios. Se presenta esa diferencia respecto de la práctica gratuita, sin distribuir el material privado. El precio de la ficha es solo de referencia y no se publica como una oferta vigente.

Pendiente para habilitar una venta futura: precio vigente confirmado, disponibilidad y condiciones concretas de entrega/cambios, y destino de compra verificado. El canal de consulta actual es el WhatsApp publicado por IMR Tech, configurado en `site.config.json`; no se inventó un correo. `legalReviewed` permanece desactivado: la redacción técnica de los avisos no acredita una revisión jurídica.

La publicidad sigue desactivada. Los tests históricos de consentimiento se ejecutan con respuestas simuladas; no activan proveedores. El archivo `archive/commercial-v3.1/public-pages.mjs` se conserva exclusivamente como fixture de regresión de las barreras del antiguo checkout y no se compila ni se sirve.
