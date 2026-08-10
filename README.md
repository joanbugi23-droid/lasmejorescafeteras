# Las Mejores Cafeteras — sitio de afiliados de Amazon

Sitio estático (Astro) con recomendaciones de cafeteras por categoría. Los precios,
la disponibilidad, el título y la imagen de cada producto se obtienen automáticamente
de la **Amazon Creators API** — no se editan a mano.

> La antigua Product Advertising API 5.0 (autenticada con AWS Signature V4) se
> retiró el 15/05/2026. Amazon la sustituyó por Creators API, que usa credenciales
> OAuth (Client ID + Client Secret) en vez de claves AWS.

## Cómo añadir una cafetera nueva

Abre [`src/data/products.json`](src/data/products.json) y añade una línea con el ASIN
del producto (lo sacas de la URL de Amazon, ej. `amazon.es/dp/B0CCDBVYQ7`) y la
categoría a la que pertenece:

```json
{ "asin": "B0XXXXXXXX", "category": "las-mejores-cafeteras-express" }
```

Categorías disponibles (ver [`src/data/categories.json`](src/data/categories.json)):
`las-mejores-cafeteras-italianas`, `las-mejores-cafeteras-express`,
`las-mejores-cafeteras-superautomaticas`, `las-mejores-cafeteras-de-grano`,
`las-mejores-cafeteras-de-capsulas`.

Añade `"featured": true` si quieres que también aparezca en el bloque
"Las Cafeteras que Más Recomendamos" de la portada.

Guarda y sube el cambio a `main` (o pide que lo haga por ti). El despliegue
automático se encarga de consultar el precio real y publicar el sitio.

## Cómo se actualizan los precios

`scripts/fetch-prices.mjs` pide un token OAuth (client_credentials) y llama a
`getItems` de Creators API por cada ASIN único de `products.json`, generando
`src/data/prices.generated.json`, que las páginas usan al construirse. No depende
de ninguna librería de terceros, solo `fetch` nativo de Node.

**Requisito de elegibilidad de Amazon**: para poder llamar a la API hacen falta
al menos **10 ventas válidas en los últimos 30 días** en la cuenta de Afiliado
(puede tardar hasta 48h en activarse tras crear la credencial). Si no se cumple,
la API devuelve el error `AssociateNotEligible` y el script lo deja escrito en
el log sin romper el despliegue (conserva los precios ya guardados).

Este script se ejecuta automáticamente **cada día a las 06:00 UTC** mediante GitHub
Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)), y también
cada vez que se sube un cambio a `main`. Después del refresco, reconstruye el sitio
y lo despliega en Cloudflare Pages.

## Desarrollo local

```bash
npm install
npm run dev
```

Para probar la actualización de precios en tu máquina, copia `.env.example` a
`.env` y rellena tus credenciales de Creators API (ese archivo nunca se sube al
repositorio):

```bash
npm run fetch-prices
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
