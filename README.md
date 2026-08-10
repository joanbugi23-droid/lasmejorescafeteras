# Las Mejores Cafeteras — sitio de afiliados de Amazon

Sitio estático (Astro) con recomendaciones de cafeteras por categoría. Los precios,
la disponibilidad, el título y la imagen de cada producto se obtienen automáticamente
de Amazon Product Advertising API (PA-API 5.0) — no se editan a mano.

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

`scripts/fetch-prices.mjs` llama a PA-API 5.0 (`GetItems`) por cada ASIN único de
`products.json` y genera `src/data/prices.generated.json`, que las páginas usan al
construirse. No usa ninguna librería de terceros para firmar las peticiones
(AWS Signature V4), solo el módulo `crypto` de Node — así no depende de paquetes
sin mantenimiento.

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
`.env` y rellena tus credenciales de PA-API (ese archivo nunca se sube al
repositorio):

```bash
npm run fetch-prices
```

## Desplegar en producción (`lasmejorescafeteras.com`)

1. **Repositorio en GitHub**: sube esta carpeta a un repositorio (puede ser privado).
2. **Cuenta de Cloudflare** (gratis): crea un proyecto de **Cloudflare Pages** conectado
   a ese repositorio, framework preset "Astro", comando de build `npm run build`,
   carpeta de salida `dist`.
3. **Secrets del repositorio** (GitHub → Settings → Secrets and variables → Actions):
   - `AMAZON_ACCESS_KEY`, `AMAZON_SECRET_KEY`, `AMAZON_PARTNER_TAG` (credenciales de PA-API)
   - `CLOUDFLARE_API_TOKEN` (con permiso "Cloudflare Pages: Edit")
   - `CLOUDFLARE_ACCOUNT_ID`
4. **Dominio propio**: en Cloudflare Pages → tu proyecto → Custom domains, añade
   `lasmejorescafeteras.com` y sigue las instrucciones para apuntar el DNS (si el
   dominio ya usa Cloudflare como DNS, se conecta con un par de clics; si está en
   otro proveedor, te dará un registro CNAME/A que añadir allí).

Ningún secreto se guarda nunca en el código ni en el repositorio: solo viven como
variables de entorno en GitHub Actions y en Cloudflare.
