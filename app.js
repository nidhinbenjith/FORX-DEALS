const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'}).format(value);
const state = {products: [], filter:'all', sort:'featured'};

function render() {
  let products = [...state.products];
  if (state.filter !== 'all') products = products.filter(product => product.category === state.filter);
  if (state.sort === 'low') products.sort((a, b) => a.price - b.price);
  if (state.sort === 'high') products.sort((a, b) => b.price - a.price);
  $('#productCount').textContent = `${products.length.toString().padStart(2, '0')} DEAL${products.length === 1 ? '' : 'S'}`;
  $('#productGrid').innerHTML = products.length ? products.map((p, index) => `
    <article class="product-card">
      <a class="product-image-wrap" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.name)}">
        <img class="product-image" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'">
        <span class="card-index">FE / ${String(index + 1).padStart(2, '0')}</span>
      </a>
      <div class="product-info"><h3 class="product-name">${esc(p.name)}</h3>
        <p class="product-description">${esc(p.description || 'A hand-picked find from the Forex Deals collection.')}</p>
        <div class="product-bottom"><span class="product-price">${money(p.price)}</span><a class="product-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">View product <span>↗</span></a></div>
      </div>
    </article>`).join('') : '<div class="empty-state">No finds in this edit yet. Check back soon.</div>';
}

async function loadProducts() {
  try {
    const response = await fetch('/catalog.json');
    if (!response.ok) throw new Error('The collection is temporarily unavailable. Please refresh.');
    state.products = await response.json();
    render();
  } catch (error) {
    $('#productGrid').innerHTML = `<p class="loading">${esc(error.message || 'Could not load the collection.')}</p>`;
  }
}

$('#sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.filter.active')?.classList.remove('active');
  button.classList.add('active');
  state.filter = button.dataset.filter;
  render();
}));
$('#year').textContent = new Date().getFullYear();
loadProducts();
