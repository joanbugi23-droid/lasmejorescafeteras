# Las Mejores Cafeteras — sitio de afiliados de Amazon

Sitio estático (Astro) con recomendaciones de cafeteras por categoría. Los precios,
la disponibilidad, el título y la imagen de cada producto se obtienen automáticamente
de la **Amazon Creators API** — no se editan a mano.

> La antigua Product Advertising API 5.0 (autenticada con AWS Signature V4) se
> retiró el 15/05/2026. Amazon la sustituyó por Creators API, que usa credenciales
> OAuth (Client ID + Client Secret) en vez de claves AWS.

## Cómo se eligen los productos de cada categoría

**Método principal — automático**: cada categoría se rellena sola llamando a
`SearchItems` de Creators API con una palabra clave (ej. "cafetera express"),
ordenado por reseñas/relevancia. Las palabras clave están en
[`src/data/searchQueries.json`](src/data/searchQueries.json). Si Amazon empieza
a vender bien un modelo nuevo, aparecerá solo — no hay que tocar nada.

Para añadir una categoría nueva (por ejemplo otro tipo de cafetera), solo hace
falta:
1. Una entrada en [`src/data/categories.json`](src/data/categories.json) (título, intro, pros/contras).
2. Una entrada en [`src/data/searchQueries.json`](src/data/searchQueries.json) con la palabra clave a buscar.

**Método secundario — forzar un producto puntual**: si quieres que aparezca
sí o sí un producto concreto, añade su ASIN en
[`src/data/products.json`](src/data/products.json):

```json
{ "asin": "B0XXXXXXXX", "category": "las-mejores-cafeteras-express" }
```

Estos ASINs "forzados" van siempre primero en su categoría, antes que los
resultados de la búsqueda automática.

## Cómo se actualizan los precios y el catálogo

`scripts/fetch-catalog.mjs` pide un token OAuth (client_credentials) y llama a
`searchItems` (una vez por categoría, más "Top Cafeteras" y "Ofertas del mes")
y a `getItems` (para los ASINs forzados y las páginas "Top Cafeteras {año}").
No depende de ninguna librería de terceros, solo `fetch` nativo de Node.

**`src/data/catalog.generated.json` es una cache persistente que se sube al
repositorio** (no es un archivo temporal): guarda los datos de cada producto
(precio, descuento, disponibilidad, valoración, imagen...) y qué ASINs
componen cada categoría / el Top / las ofertas. Cada ejecución solo sobrescribe
lo que la API respondió con éxito esa vez; si una búsqueda o un ASIN falla (API
caída, cuenta no elegible todavía, error puntual...) se conserva el último dato
válido guardado, así la web nunca se queda sin productos ni muestra datos
rotos. El workflow hace commit automático de ese archivo cuando cambia (con
`[skip ci]` en el mensaje para no disparar despliegues en bucle).

**Requisito de elegibilidad de Amazon**: para poder llamar a la API hacen falta
al menos **10 ventas válidas en los últimos 30 días** en la cuenta de Afiliado
(puede tardar hasta 48h en activarse tras crear la credencial). Mientras no se
cumpla, la API devuelve el error `AssociateNotEligible`, el script lo deja
escrito en el log y no toca la cache — el sitio sigue funcionando con los
últimos datos que tenga (o con el enlace directo a Amazon si aún no hay ninguno).

Este script se ejecuta automáticamente **cada día a las 06:00 UTC** mediante GitHub
Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)), y también
cada vez que se sube un cambio a `main`. Después del refresco, reconstruye el sitio
y lo despliega en Cloudflare Pages.

## Páginas "Top Cafeteras {año}"

Se crean una vez al año, con una lista fija de ASINs elegidos a mano en
[`src/data/tops.json`](src/data/tops.json) — dentro de cada una, el precio y
la disponibilidad se siguen actualizando solos vía API. Para crear la de un
año nuevo, añade una entrada nueva a ese archivo:

```json
{ "year": 2027, "asins": ["B0XXXXXXXX", "..."] }
```

## Desarrollo local

```bash
npm install
npm run dev
```

Para probar la actualización de precios en tu máquina, copia `.env.example` a
`.env` y rellena tus credenciales de Creators API (ese archivo nunca se sube al
repositorio):

```bash
npm run fetch-catalog
```

## Desplegar en producción (`lasmejorescafeteras.com`, dominio en Hostinger)

El repositorio ya está en GitHub: [joanbugi23-droid/lasmejorescafeteras](https://github.com/joanbugi23-droid/lasmejorescafeteras).
El despliegue lo hace por completo la GitHub Action ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))
con `wrangler pages deploy`, que **crea el proyecto de Cloudflare Pages automáticamente**
en el primer despliegue — no hace falta conectar el repositorio a mano desde el
panel de Cloudflare.

1. **Cuenta de Cloudflare** (gratis, solo un email): [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. **Account ID**: una vez dentro, en el panel de "Workers & Pages" (o en la home
   del dashboard), en la columna derecha aparece tu **Account ID**. Cópialo.
3. **API Token**: ve a [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) →
   "Create Token" → "Create Custom Token" → permiso **Account · Cloudflare Pages · Edit**
   → selecciona tu cuenta → "Continue to summary" → "Create Token". Cópialo (solo se
   muestra una vez).
4. **Secrets del repositorio** (GitHub → tu repo → Settings → Secrets and variables →
   Actions → "New repository secret"), uno por uno:
   - `AMAZON_CREDENTIAL_ID`, `AMAZON_CREDENTIAL_SECRET`, `AMAZON_PARTNER_TAG` (los mismos valores que ya tienes en tu `.env` local / el CSV de Creators API)
   - `CLOUDFLARE_API_TOKEN` (del paso 3)
   - `CLOUDFLARE_ACCOUNT_ID` (del paso 2)
5. **Lanzar el primer despliegue**: con los 5 secrets creados, ve a la pestaña
   "Actions" del repositorio → workflow "Actualizar precios y desplegar" → "Run workflow".
   Esto crea el proyecto `lasmejorescafeteras` en Cloudflare Pages y publica el sitio
   en una URL tipo `lasmejorescafeteras.pages.dev`.
6. **Dominio propio**: en el dashboard de Cloudflare → Workers & Pages → proyecto
   `lasmejorescafeteras` → Custom domains → añade `lasmejorescafeteras.com`. Cloudflare
   te dará un registro **CNAME** (o a veces un `TXT` de verificación primero) — entra
   en **Hostinger → hPanel → Dominios → DNS / Nameservers** y añade ese registro ahí.
   No hace falta mover el dominio ni cambiar los nameservers a Cloudflare: el DNS
   sigue en Hostinger, solo se añade ese registro apuntando al sitio.

Ningún secreto se guarda nunca en el código ni en el repositorio: solo viven como
GitHub Secrets y dentro de Cloudflare.
