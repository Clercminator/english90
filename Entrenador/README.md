# English 90 Trainer — candidato v1.0

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
