const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));
const money = value => new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR'}).format(value);
const priceValue = product => {
  if (product.price === null || product.price === undefined || String(product.price).trim() === '') return null;
  const price = Number(product.price);
  return Number.isFinite(price) ? price : null;
};
const state = {products: [], filter: 'all', sort: 'featured', query: ''};

function displayCategory(category) {
  const value = String(category ?? '').trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function renderCategories() {
  const categories = [...new Set(state.products
    .map(product => String(product.category ?? '').trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $('#categoryFilters').innerHTML = [
    '<button class="filter active" type="button" data-filter="all" aria-pressed="true">All Products</button>',
    ...categories.map(category =>
      `<button class="filter" type="button" data-filter="${esc(category)}" aria-pressed="false">${esc(displayCategory(category))}</button>`)
  ].join('');
}

function matchesSearch(product) {
  const searchable = [product.name, product.description, product.category]
    .filter(value => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase();
  return searchable.includes(state.query);
}

function productCard(product, index) {
  const name = typeof product.name === 'string' && product.name.trim() ? product.name.trim() : 'Product';
  const description = typeof product.description === 'string' ? product.description.trim() : '';
  const category = typeof product.category === 'string' ? product.category.trim() : '';
  const image = typeof product.image === 'string' ? product.image.trim() : '';
  const url = typeof product.url === 'string' ? product.url.trim() : '';
  const price = priceValue(product);
  const imageMarkup = image
    ? `<img class="product-image" src="${esc(image)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="image-placeholder" role="img" aria-label="No product image available"><span aria-hidden="true">F</span></div>`;
  const destinationMarkup = url
    ? `<a class="product-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Buy Now <span aria-hidden="true">↗</span></a>`
    : '<span class="product-unavailable">Link unavailable</span>';
  const categoryMarkup = category
    ? `<span class="product-category">${esc(displayCategory(category))}</span>`
    : '';
  const descriptionMarkup = description
    ? `<p class="product-description">${esc(description)}</p>`
    : '';
  const priceMarkup = price !== null && price >= 0
    ? `<span class="product-price">${money(price)}</span>`
    : '<span class="product-price">Price unavailable</span>';

  return `
    <article class="product-card">
      <div class="product-image-wrap">
        ${imageMarkup}
        <span class="card-index">FE / ${String(index + 1).padStart(2, '0')}</span>
      </div>
      <div class="product-info">
        <div class="product-meta">${categoryMarkup}</div>
        <h3 class="product-name">${esc(name)}</h3>
        ${descriptionMarkup}
        <div class="product-bottom">${priceMarkup}${destinationMarkup}</div>
      </div>
    </article>`;
}

function render() {
  let products = state.products.filter(product => {
    const matchesCategory = state.filter === 'all' || String(product.category ?? '').trim() === state.filter;
    return matchesCategory && matchesSearch(product);
  });
  if (state.sort === 'low') products.sort((a, b) => (priceValue(a) ?? Infinity) - (priceValue(b) ?? Infinity));
  if (state.sort === 'high') products.sort((a, b) => (priceValue(b) ?? -Infinity) - (priceValue(a) ?? -Infinity));

  $('#productCount').textContent = `${products.length} ${products.length === 1 ? 'deal' : 'deals'}`;
  const grid = $('#productGrid');
  grid.innerHTML = products.length
    ? products.map(productCard).join('')
    : `<div class="empty-state">
        <span class="empty-mark" aria-hidden="true">⌕</span>
        <h3>No products found</h3>
        <p>Try a different search or clear your filters to see the full collection.</p>
        <button class="empty-reset" type="button">Show all products</button>
      </div>`;
  grid.setAttribute('aria-busy', 'false');

  grid.querySelectorAll('.product-image').forEach(image => {
    image.addEventListener('error', () => {
      image.hidden = true;
      image.parentElement.classList.add('image-missing');
    }, {once: true});
  });
}

function resetFilters() {
  state.filter = 'all';
  state.sort = 'featured';
  state.query = '';
  $('#productSearch').value = '';
  $('#sort').value = 'featured';
  $('#categoryFilters').querySelectorAll('.filter').forEach(button => {
    const active = button.dataset.filter === 'all';
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  render();
}

async function loadProducts() {
  try {
    const response = await fetch('/catalog.json');
    if (!response.ok) throw new Error('The collection is temporarily unavailable. Please refresh.');
    const products = await response.json();
    if (!Array.isArray(products)) throw new Error('The product collection could not be read.');
    state.products = products.filter(product => product && typeof product === 'object' && !Array.isArray(product));
    renderCategories();
    render();
  } catch (error) {
    $('#productGrid').innerHTML = `<p class="loading" role="status">${esc(error.message || 'Could not load the collection.')}</p>`;
    $('#productGrid').setAttribute('aria-busy', 'false');
  }
}

$('#sort').addEventListener('change', event => {
  state.sort = event.target.value;
  render();
});

$('#categoryFilters').addEventListener('click', event => {
  const button = event.target.closest('.filter');
  if (!button) return;
  state.filter = button.dataset.filter;
  $('#categoryFilters').querySelectorAll('.filter').forEach(filterButton => {
    const active = filterButton === button;
    filterButton.classList.toggle('active', active);
    filterButton.setAttribute('aria-pressed', String(active));
  });
  render();
});

$('#productSearch').addEventListener('input', event => {
  state.query = event.target.value.trim().toLocaleLowerCase();
  render();
});

$('.header-search').addEventListener('submit', event => {
  event.preventDefault();
  $('#products').scrollIntoView({behavior: 'smooth'});
});

$('#resetFilters').addEventListener('click', resetFilters);
$('#productGrid').addEventListener('click', event => {
  if (event.target.closest('.empty-reset')) resetFilters();
});

const menuToggle = $('.menu-toggle');
const navigation = $('#primaryNavigation');
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!expanded));
  navigation.classList.toggle('open', !expanded);
});
navigation.addEventListener('click', event => {
  if (!event.target.closest('a')) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  navigation.classList.remove('open');
});

$('#year').textContent = new Date().getFullYear();
loadProducts();
