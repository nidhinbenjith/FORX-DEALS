# Forex Deals

A responsive product catalog built with HTML, CSS and browser JavaScript, served by Node.js, with a Java 21 API and MySQL product database.

## Run it on Windows

Install Java 21, Maven, Node.js 18 or newer, and XAMPP. From the `D:\f` folder, start **MySQL** in the XAMPP Control Panel. With the default local settings (`root` with a blank password), the API creates the `forex_deals` database and products table automatically. If your XAMPP MySQL credentials differ, set `FOREX_DB_USER` and `FOREX_DB_PASSWORD` before starting it.

1. In PowerShell in `D:\f`, start the Java API:

   ```powershell
   npm run start:api
   ```

   A local admin password is stored in the ignored `.env.local` file; use that value on the admin login page. You can change it by editing that file. Keep it private and do not commit it. If your XAMPP MySQL credentials differ from the defaults, set `FOREX_DB_USER` and `FOREX_DB_PASSWORD` in this PowerShell window first.

2. In a second PowerShell window in `D:\f`, start the local website:

   ```powershell
   npm start
   ```

3. Visit [http://localhost:3000](http://localhost:3000). Open [http://localhost:3000/admin.html](http://localhost:3000/admin.html) and enter the API password to manage product slots.

Node serves the website on port 3000 and proxies `/api/*` requests to the Java API on port 8081. Set `PORT`, `JAVA_API_URL`, or `JAVA_API_PORT` if those defaults conflict with your setup.

## Product slots

In the local admin page, add a product name, type, price in INR, destination URL, and a PNG, JPG, GIF, or WEBP image up to 5 MB. A short description is optional. Admin can remove products. Product records are stored in the `forex_deals.products` MySQL table. On first startup, the API imports existing valid entries from `data/products.json` when the MySQL table is empty.

## Publishing the catalog to Netlify

Netlify hosts the public storefront as a static site. The admin page, Java API, and MySQL database remain local and are not deployed. After adding or deleting products locally, the API updates `catalog.json`; uploaded image files are saved in `uploads/`.

To prepare and publish a snapshot of the current catalog:

```powershell
npm run build:site
```

This creates `dist/` with the public storefront, exported product catalog, and uploaded images; it excludes the admin page and backend. Connect the project to Netlify and keep the `netlify.toml` build settings (`npm run build:site`, publish `dist`). Commit and push the changed website files, `catalog.json`, and new files in `uploads/` to trigger a deployment. If you are not using Git-based deploys, build the site and manually deploy the `dist` folder. Product changes made locally appear on Netlify after the new deploy completes; the visitor-facing Netlify site cannot connect to a backend running only on your PC.

Product destination links must use `http` or `https`.

## Project files

- `index.html`, `styles.css`, `app.js`: public storefront
- `admin.html`, `admin.css`, `admin.js`: product management page
- `server.mjs`: local Node.js web server and API proxy
- `start-api.ps1`: builds and starts the local Java/MySQL API
- `build-site.mjs`, `netlify.toml`: create and configure the public Netlify site
- `src/main/java/com/shop/api/StoreApi.java`: Java 21 API and MySQL persistence
- `pom.xml`: Java and MySQL Connector/J dependencies
- `data/products.json`: one-time import source for the legacy catalog
