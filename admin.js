const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'}).format(value);
const state = {password: ''};
let previewUrl;
async function api(path, options = {}) {
  const headers = {'Content-Type': options.contentType || 'application/json', ...(state.password ? {Authorization:'Bearer ' + state.password} : {}), ...(options.headers || {})};
  const response = await fetch(path, {...options, headers});
  const body = await response.text();
  let data = {};
  if (body) {
    try { data = JSON.parse(body); }
    catch { data.message = body.slice(0, 240); }
  }
  if (!response.ok) throw new Error(data.message || `Request failed (HTTP ${response.status}). Check that the Java API and MySQL are running.`);
  return data;
}

async function showDashboard(event) {
  event.preventDefault();
  const button = $('#enterAdmin');
  button.disabled = true;
  $('#loginError').textContent = '';
  state.password = $('#adminPassword').value;
  try {
    await api('/api/admin/products');
    $('#gate').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');
    await loadProducts();
  } catch (error) {
    state.password = '';
    $('#loginError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2300);
}

async function loadProducts() {
  try {
    const products = await api('/api/admin/products');
    $('#productCount').textContent = String(products.length).padStart(2, '0');
    $('#adminProducts').innerHTML = products.length ? products.map(product => `
      <article class="admin-product"><img src="${esc(product.image)}" alt="" onerror="this.style.opacity='.2'">
        <div><h3>${esc(product.name)}</h3><div class="price-line">${money(product.price)} · ${esc(product.category)}</div><p>${esc(product.url)}</p></div>
        <button class="remove" type="button" data-remove="${esc(product.id)}">DELETE</button>
      </article>`).join('') : '<p class="empty">No product slots yet. Add the first edit to get started.</p>';
    document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Delete this product from Forex Deals?')) return;
      button.disabled = true;
      try {
        await api('/api/admin/products', {method:'DELETE', body:JSON.stringify({id:button.dataset.remove})});
        await loadProducts();
        toast('Product deleted.');
      } catch (error) { toast(error.message); button.disabled = false; }
    }));
  } catch (error) {
    $('#adminProducts').innerHTML = `<p class="error">${esc(error.message)}</p>`;
  }
}

$('#productForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  $('#productError').textContent = '';
  let step = 'Preparing product';
  try {
    const formData = new FormData(form);
    const imageFile = formData.get('imageFile');
    if (!imageFile.size) throw new Error('Choose an image file to continue.');
    step = 'Uploading image';
    const upload = await api('/api/admin/images', {
      method:'POST',
      contentType:imageFile.type,
      body:await imageFile.arrayBuffer()
    });
    const product = Object.fromEntries(formData);
    delete product.imageFile;
    product.image = upload.image;
    step = 'Saving product';
    await api('/api/admin/products', {method:'POST', body:JSON.stringify(product)});
    form.reset();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    $('#imagePreview').classList.add('hidden');
    await loadProducts();
    toast('Product published to the storefront.');
  } catch (error) {
    $('#productError').textContent = `${step}: ${error.message || 'Could not contact the store API. Check that the Java API and MySQL are running.'}`;
  }
  finally { button.disabled = false; }
});

$('#lockButton').addEventListener('click', () => {
  state.password = '';
  $('#adminPassword').value = '';
  $('#dashboard').classList.add('hidden');
  $('#gate').classList.remove('hidden');
});
$('#refresh').addEventListener('click', loadProducts);
$('#adminLogin').addEventListener('submit', showDashboard);
$('#productForm [name=imageFile]').addEventListener('change', event => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  const file = event.target.files[0];
  if (!file) {
    previewUrl = undefined;
    $('#imagePreview').classList.add('hidden');
    return;
  }
  previewUrl = URL.createObjectURL(file);
  $('#previewImage').src = previewUrl;
  $('#imagePreview').classList.remove('hidden');
});
