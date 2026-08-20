# DEJA AQUI LOS EXPORTS DE ATOMS

Carpeta de entrega para los `.zip` de **Share → Export** de Atoms.
Creada en PB-DRIFT-001, fase DRIFT-B.2, tras confirmar que Atoms no puede hacer push a Git.

---

## Que descargar

En **cada** proyecto de Atoms: boton **Share → Export**, esquina superior derecha.
Documentacion: https://help.atoms.dev/en/articles/12129279-share

**Codigo fuente, no build.** Si el zip contiene una carpeta `dist/` con ficheros
`index-XXXX.js` minificados y no contiene `src/`, es el build y no sirve.

## Como nombrar los ficheros

Un zip por proyecto, con el nombre del hostname:

```
app.zip          <-- PRIORITARIO. Contiene las 7 rutas que faltan en Git
www.zip
academy.zip
community.zip
companies.zip
tools.zip
jobs.zip
early.zip
```

Si Atoms impone otro nombre al descargar, da igual: renombra o dejalo tal cual y avisa.

## Orden recomendado

**`app.zip` primero y solo.** Es el que cierra el riesgo CRITICAL y el que levanta la prohibicion de
conectar despliegues. Los 7 satelites pueden esperar; ninguno tiene usuarios ni datos.

No hace falta descargarlos todos de una sentada.

## Que pasa despues

Avisame en cuanto haya al menos un zip aqui. Yo me encargo de:

1. Descomprimir y revisar el arbol de ficheros.
2. **Verificar que los 7 ficheros estan**, uno a uno:
   `ForgotPassword.tsx` · `ResetPassword.tsx` · `CompanyBilling.tsx` · `CompanySettings.tsx` ·
   `CompanyDocumentation.tsx` · `Privacy.tsx` · `Terms.tsx`
3. Auditar secretos antes de cualquier commit — igual que se hizo con Stripe.
4. Crear la rama `atoms/source-export-2026-08-20`. **No se mergea a `main` sin tu visto bueno.**
5. Sacar el diff contra `main` para que veas exactamente que entra.
6. Contrastar las rutas del fuente con las 30 del bundle de produccion ya archivado.

## Por que el paso 6

El export es el **fuente actual del proyecto de Atoms**. Entre ese fuente y lo que sirve produccion
hay una accion de publicar que puede no haberse ejecutado — es justo lo que paso con `www` durante
tres dias en F0.

Si el export declara rutas que produccion no sirve, existe un tercer nivel de drift:
**Atoms-fuente ≠ Atoms-publicado ≠ Git.** Se comprueba, no se da por supuesto.

## Sobre el peso

Los zips pueden ser grandes. Si superan los 100 MB, GitHub rechaza el push y habra que decidir si
se ingiere solo el contenido descomprimido sin el zip. Avisame del tamaño y lo resolvemos antes de
intentar el push.

---

**Esta carpeta y este fichero no son codigo.** Se pueden borrar cuando la ingesta termine.
