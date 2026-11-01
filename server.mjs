import { createServer } from 'node:http';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { extname, resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const apiBase = process.env.JAVA_API_URL || 'http://127.0.0.1:8081';
const catalogFile = resolve(root, 'catalog.json');
const productsFile = resolve(root, 'data', 'products.json');
const analyticsFile = resolve(root, 'data', 'analytics.json');
const uploadsDir = resolve(root, 'uploads');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

// ----------------- Analytics Engine -----------------
let analyticsMemory = null;
let saveDebounceTimer = null;

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function initDefaultAnalytics() {
  return {
    version: 1,
    totalViews: 0,
    totalUniques: 0,
    allTimeUniqueIds: [],
    days: {},
    recentPings: []
  };
}

async function loadAnalytics() {
  if (analyticsMemory) return analyticsMemory;
  try {
    const raw = await readFile(analyticsFile, 'utf8');
    analyticsMemory = JSON.parse(raw);
    if (!analyticsMemory.days) throw new Error('invalid format');
    if (!Array.isArray(analyticsMemory.allTimeUniqueIds)) analyticsMemory.allTimeUniqueIds = [];
  } catch {
    analyticsMemory = initDefaultAnalytics();
    await saveAnalytics(analyticsMemory);
  }
  return analyticsMemory;
}

async function saveAnalytics(data) {
  try {
    await mkdir(resolve(root, 'data'), { recursive: true });
    await writeFile(analyticsFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save analytics.json:', err);
  }
}

async function recordVisit(visitorId, sessionId, path, ip) {
  const analytics = await loadAnalytics();
  const now = new Date();
  const todayKey = formatDateKey(now);
  const currentHour = now.getHours();

  if (!analytics.days) analytics.days = {};
  if (!Array.isArray(analytics.allTimeUniqueIds)) analytics.allTimeUniqueIds = [];

  if (!analytics.days[todayKey]) {
    analytics.days[todayKey] = {
      views: 0,
      uniques: 0,
      hourly: Array(24).fill(0),
      uniqueIds: []
    };
  }

  const dayObj = analytics.days[todayKey];
  if (!dayObj.hourly) dayObj.hourly = Array(24).fill(0);
  if (!Array.isArray(dayObj.uniqueIds)) dayObj.uniqueIds = [];

  // Determine visitor identifier
  let vId = String(visitorId || '').trim();
  if (!vId && ip) {
    vId = 'ip_' + Buffer.from(ip).toString('base64').slice(0, 16);
  }
  if (!vId) {
    vId = 'v_' + randomUUID().slice(0, 8);
  }

  // Record actual page view
  dayObj.views = (dayObj.views || 0) + 1;
  analytics.totalViews = (analytics.totalViews || 0) + 1;
  dayObj.hourly[currentHour] = (dayObj.hourly[currentHour] || 0) + 1;

  // Deduplicate unique visitor for today
  if (!dayObj.uniqueIds.includes(vId)) {
    dayObj.uniqueIds.push(vId);
    dayObj.uniques = dayObj.uniqueIds.length;
  }

  // Deduplicate all-time unique visitor
  if (!analytics.allTimeUniqueIds.includes(vId)) {
    analytics.allTimeUniqueIds.push(vId);
    analytics.totalUniques = analytics.allTimeUniqueIds.length;
  }

  // Track live active visits within last 5 minutes
  const timestamp = now.getTime();
  if (!Array.isArray(analytics.recentPings)) analytics.recentPings = [];
  analytics.recentPings.push({ time: timestamp, vid: vId });
  const fiveMinAgo = timestamp - 5 * 60 * 1000;
  analytics.recentPings = analytics.recentPings.filter(p => p.time > fiveMinAgo);

  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => saveAnalytics(analytics), 600);
}

async function getAnalyticsReport() {
  const analytics = await loadAnalytics();
  const now = new Date();
  const todayKey = formatDateKey(now);
  const yesterdayKey = formatDateKey(new Date(now.getTime() - 86400000));

  const todayData = analytics.days[todayKey] || { views: 0, uniques: 0, hourly: Array(24).fill(0), uniqueIds: [] };
  const yesterdayData = analytics.days[yesterdayKey] || { views: 0, uniques: 0 };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Last 7 days series & deduplicated uniques
  const last7Days = [];
  let weekViews = 0;
  const weekUniqueSet = new Set();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = formatDateKey(d);
    const dayStat = analytics.days[key] || { views: 0, uniques: 0, uniqueIds: [] };
    weekViews += dayStat.views || 0;
    (dayStat.uniqueIds || []).forEach(id => weekUniqueSet.add(id));
    last7Days.push({
      date: key,
      label: `${d.getDate()} ${monthNames[d.getMonth()]}`,
      day: dayNames[d.getDay()],
      views: dayStat.views || 0,
      uniques: dayStat.uniques || (dayStat.uniqueIds ? dayStat.uniqueIds.length : 0)
    });
  }
  const weekUniques = weekUniqueSet.size;

  // Last 30 days series & deduplicated uniques
  const last30Days = [];
  let monthViews = 0;
  const monthUniqueSet = new Set();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = formatDateKey(d);
    const dayStat = analytics.days[key] || { views: 0, uniques: 0, uniqueIds: [] };
    monthViews += dayStat.views || 0;
    (dayStat.uniqueIds || []).forEach(id => monthUniqueSet.add(id));
    last30Days.push({
      date: key,
      label: `${d.getDate()} ${monthNames[d.getMonth()]}`,
      views: dayStat.views || 0,
      uniques: dayStat.uniques || (dayStat.uniqueIds ? dayStat.uniqueIds.length : 0)
    });
  }
  const monthUniques = monthUniqueSet.size;

  // Last 365 days / 12 Months series & deduplicated uniques
  const last1Year = [];
  let yearViews = 0;
  const yearUniqueSet = new Set();
  for (let m = 11; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const monthKey = formatMonthKey(d);
    const label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;

    let mViews = 0;
    const mUniqueSet = new Set();
    for (const [dayKey, dayStat] of Object.entries(analytics.days)) {
      if (dayKey.startsWith(monthKey)) {
        mViews += dayStat.views || 0;
        (dayStat.uniqueIds || []).forEach(id => {
          mUniqueSet.add(id);
          yearUniqueSet.add(id);
        });
      }
    }
    yearViews += mViews;
    last1Year.push({
      month: monthKey,
      label,
      views: mViews,
      uniques: mUniqueSet.size
    });
  }
  const yearUniques = yearUniqueSet.size;

  // Today Hourly series
  const todayHourly = [];
  const hourlyArr = todayData.hourly || Array(24).fill(0);
  for (let h = 0; h < 24; h++) {
    const hourLabel = `${String(h).padStart(2, '0')}:00`;
    const hViews = hourlyArr[h] || 0;
    todayHourly.push({
      hour: hourLabel,
      views: hViews,
      uniques: hViews > 0 ? Math.min(hViews, todayData.uniques || hViews) : 0
    });
  }

  // Active visitors in last 5 minutes
  const fiveMinAgo = now.getTime() - 5 * 60 * 1000;
  const recentPings = (analytics.recentPings || []).filter(p => p.time > fiveMinAgo);
  const activeNow = new Set(recentPings.map(p => p.vid)).size;

  // Peak hour today
  let peakHour = '--';
  let maxHourViews = 0;
  todayHourly.forEach(item => {
    if (item.views > maxHourViews) {
      maxHourViews = item.views;
      peakHour = `${item.hour} (${item.views} visits)`;
    }
  });

  // Top month in past year
  let topMonth = '--';
  let maxMonthViews = 0;
  last1Year.forEach(item => {
    if (item.views > maxMonthViews) {
      maxMonthViews = item.views;
      topMonth = `${item.label} (${item.views} visits)`;
    }
  });

  return {
    summary: {
      today: {
        views: todayData.views || 0,
        uniques: todayData.uniques || 0
      },
      yesterday: {
        views: yesterdayData.views || 0,
        uniques: yesterdayData.uniques || 0
      },
      week: {
        views: weekViews,
        uniques: weekUniques,
        avgDaily: Math.round(weekViews / 7)
      },
      month: {
        views: monthViews,
        uniques: monthUniques,
        avgDaily: Math.round(monthViews / 30)
      },
      year: {
        views: yearViews,
        uniques: yearUniques,
        avgMonthly: Math.round(yearViews / 12)
      },
      allTime: {
        views: analytics.totalViews || yearViews || 0,
        uniques: analytics.allTimeUniqueIds ? analytics.allTimeUniqueIds.length : (analytics.totalUniques || yearUniques || 0)
      }
    },
    series: {
      today: todayHourly,
      week: last7Days,
      month: last30Days,
      year: last1Year
    },
    live: {
      activeNow,
      lastVisitTime: now.toISOString(),
      peakHour,
      topMonth
    }
  };
}

// ----------------- Authentication & Catalog -----------------
async function getAdminPassword() {
  if (process.env.FOREX_ADMIN_PASSWORD) return process.env.FOREX_ADMIN_PASSWORD.trim();
  try {
    const envContent = await readFile(resolve(root, '.env.local'), 'utf8');
    const match = envContent.match(/^FOREX_ADMIN_PASSWORD=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}
  return '';
}

async function readCatalog() {
  try {
    const raw = await readFile(catalogFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeCatalog(products) {
  const json = JSON.stringify(products, null, 2);
  await writeFile(catalogFile, json, 'utf8');
  try {
    await mkdir(resolve(root, 'data'), { recursive: true });
    await writeFile(productsFile, json, 'utf8');
  } catch {}
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function handleLocalApi(req, res, url) {
  const adminPassword = await getAdminPassword();
  const authHeader = req.headers.authorization || '';
  const isAuthorized = authHeader.startsWith('Bearer ') && authHeader.slice(7) === adminPassword;

  // Visit beacon endpoint
  if (url.pathname === '/api/visit' && req.method === 'POST') {
    try {
      const raw = await readRequestBody(req);
      let body = {};
      if (raw.length) {
        try { body = JSON.parse(raw.toString('utf8')); } catch {}
      }
      await recordVisit(body.visitorId, body.sessionId, body.path);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'recorded' }));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Analytics report endpoint
  if (url.pathname === '/api/admin/analytics' && req.method === 'GET') {
    if (!isAuthorized) {
      res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'Admin password is incorrect.' }));
      return;
    }
    const report = await getAnalyticsReport();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(report));
    return;
  }

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', mode: 'local-fallback' }));
    return;
  }

  if (url.pathname === '/api/products' && req.method === 'GET') {
    const products = await readCatalog();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(products));
    return;
  }

  if (url.pathname === '/api/admin/products') {
    if (!isAuthorized) {
      res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'Admin password is incorrect.' }));
      return;
    }

    if (req.method === 'GET') {
      const products = await readCatalog();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(products));
      return;
    }

    if (req.method === 'POST') {
      const raw = await readRequestBody(req);
      const data = JSON.parse(raw.toString('utf8'));
      if (!data.name || !data.price || !data.url) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'Name, price and destination URL are required.' }));
        return;
      }
      const newProduct = {
        id: randomUUID(),
        name: String(data.name).trim(),
        category: String(data.category || 'Grocery').trim(),
        description: String(data.description || '').trim(),
        price: Number(data.price),
        image: String(data.image || '').trim(),
        url: String(data.url).trim(),
        createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()
      };
      const products = await readCatalog();
      products.unshift(newProduct);
      await writeCatalog(products);
      res.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(newProduct));
      return;
    }

    if (req.method === 'PUT') {
      const raw = await readRequestBody(req);
      const data = JSON.parse(raw.toString('utf8'));
      if (!data.id) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'Product ID is required for editing.' }));
        return;
      }
      const products = await readCatalog();
      const index = products.findIndex(p => p.id === data.id);
      if (index === -1) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'Product not found.' }));
        return;
      }
      const updatedProduct = {
        id: data.id,
        name: String(data.name || products[index].name).trim(),
        category: String(data.category || products[index].category).trim(),
        description: String(data.description ?? products[index].description).trim(),
        price: Number(data.price ?? products[index].price),
        image: String(data.image ?? products[index].image).trim(),
        url: String(data.url ?? products[index].url).trim(),
        createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : (products[index].createdAt || new Date().toISOString())
      };
      products[index] = updatedProduct;
      await writeCatalog(products);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(updatedProduct));
      return;
    }

    if (req.method === 'DELETE') {
      const raw = await readRequestBody(req);
      const { id } = JSON.parse(raw.toString('utf8'));
      const products = await readCatalog();
      const filtered = products.filter(p => p.id !== id);
      if (filtered.length === products.length) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'Product not found.' }));
        return;
      }
      await writeCatalog(filtered);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'removed' }));
      return;
    }

    res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: 'Method not allowed.' }));
    return;
  }

  if (url.pathname === '/api/admin/images' && req.method === 'POST') {
    if (!isAuthorized) {
      res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'Admin password is incorrect.' }));
      return;
    }
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const extMap = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp'
    };
    const ext = extMap[contentType];
    if (!ext) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'Upload a PNG, JPG, GIF, or WEBP image.' }));
      return;
    }
    const buffer = await readRequestBody(req);
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'Image must be between 1 byte and 5 MB.' }));
      return;
    }
    await mkdir(uploadsDir, { recursive: true });
    const filename = `${randomUUID()}${ext}`;
    await writeFile(join(uploadsDir, filename), buffer);
    res.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ image: `/uploads/${filename}` }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ message: 'API route not found.' }));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/visit' || url.pathname === '/api/admin/analytics') {
      try {
        await handleLocalApi(req, res, url);
        return;
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: `API error: ${err.message}` }));
        return;
      }
    }

    try {
      const upstream = await fetch(new URL(url.pathname + url.search, apiBase), {
        method: req.method,
        headers: {
          'content-type': req.headers['content-type'] || 'application/json',
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {})
        },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
        duplex: 'half'
      });
      if (upstream.status === 404) {
        await handleLocalApi(req, res, url);
        return;
      }
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store'
      });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      try {
        await handleLocalApi(req, res, url);
      } catch (localError) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: `Local API error: ${localError.message}` }));
      }
    }
    return;
  }

  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === '/' ? '/index.html' : ['/admin', '/admin/'].includes(pathname) ? '/admin.html' : pathname;
  const file = resolve(root, `.${requested}`);
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const content = await readFile(file);

    // Track storefront visits when someone loads / or /index.html
    if ((requested === '/index.html' || requested === '/') && req.method === 'GET') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      const ua = req.headers['user-agent'] || '';
      const vid = 'ip_' + Buffer.from(ip + ua).toString('base64').slice(0, 16);
      recordVisit(vid, '', '/').catch(() => {});
    }

    res.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff'
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, () => console.log(`Forex Deals storefront: http://localhost:${port}`));
