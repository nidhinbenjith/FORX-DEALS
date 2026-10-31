const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'}).format(value);
const state = { password: '' };
const categories = ['Grocery', 'Jewellery', 'Home & Decor', 'Fashion', 'Footwear', 'Electronics'];
let products = [];
let editingProduct = null;
let panelPreviewUrl;
let modalPreviewUrl;

// API helper
async function api(path, options = {}) {
  const headers = {
    'Content-Type': options.contentType || 'application/json',
    ...(state.password ? { Authorization: 'Bearer ' + state.password } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(path, { ...options, headers });
  const body = await response.text();
  let data = {};
  if (body) {
    try { data = JSON.parse(body); }
    catch { data.message = body.slice(0, 240); }
  }
  if (!response.ok) {
    throw new Error(data.message || `Request failed (HTTP ${response.status}). Check server status.`);
  }
  return data;
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}

function displayCategory(category) {
  return categories.includes(category) ? category : 'Uncategorized';
}

function updateDescCounter(textarea, counterEl) {
  if (textarea && counterEl) {
    counterEl.textContent = textarea.value.length;
  }
}

// ----------------- Product Listing -----------------
async function loadProducts() {
  try {
    products = await api('/api/admin/products');
    $('#productCount').textContent = String(products.length).padStart(2, '0');
    
    if (!products.length) {
      $('#adminProducts').innerHTML = '<p class="empty">No product slots yet. Add the first deal on the left to get started.</p>';
      return;
    }

    $('#adminProducts').innerHTML = products.map(product => {
      const isEditing = editingProduct && editingProduct.id === product.id;
      return `
      <article class="admin-product ${isEditing ? 'is-editing' : ''}" id="product-card-${esc(product.id)}" data-id="${esc(product.id)}">
        <div class="admin-product-thumb-wrap">
          <img src="${esc(product.image)}" alt="${esc(product.name)}" onerror="this.src='';this.alt='No image';this.style.opacity='.3'">
          <span class="thumb-badge">${esc(displayCategory(product.category))}</span>
        </div>
        <div class="admin-product-body">
          <div class="admin-product-top">
            <h3>${esc(product.name)}</h3>
            <span class="admin-product-price">${money(product.price)}</span>
          </div>
          ${product.description ? `<p class="admin-product-desc">${esc(product.description)}</p>` : ''}
          <p class="admin-product-url"><a href="${esc(product.url)}" target="_blank" rel="noopener noreferrer">${esc(product.url)} ↗</a></p>
        </div>
        <div class="admin-product-actions">
          <button class="edit-product" type="button" data-edit="${esc(product.id)}" title="Edit price, details, image, or description">✎ EDIT</button>
          <button class="remove" type="button" data-remove="${esc(product.id)}" title="Delete this product">✕ DELETE</button>
        </div>
      </article>`;
    }).join('');
  } catch (error) {
    $('#adminProducts').innerHTML = `<p class="error">${esc(error.message)}</p>`;
  }
}

function highlightEditingCard(id) {
  document.querySelectorAll('.admin-product').forEach(el => {
    el.classList.toggle('is-editing', el.dataset.id === id);
  });
}

// ----------------- Edit in Modal -----------------
function openEditModal(product) {
  editingProduct = product;
  highlightEditingCard(product.id);

  // Sync with panel form as well
  populatePanelForm(product);

  const modal = $('#editModal');
  const form = $('#modalProductForm');
  $('#modalTitle').textContent = `Edit Deal: ${product.name || 'Product'}`;
  $('#modalId').value = product.id;
  $('#modalName').value = product.name || '';
  $('#modalCategory').value = categories.includes(product.category) ? product.category : '';
  $('#modalPrice').value = product.price ?? '';
  $('#modalDesc').value = product.description || '';
  updateDescCounter($('#modalDesc'), $('#modalDescCount'));
  $('#modalUrl').value = product.url || '';
  $('#modalError').textContent = '';

  // Reset modal image tabs to "keep"
  setModalImageMode('keep');
  if (product.image) {
    $('#modalPreviewImg').src = product.image;
    $('#modalPreviewStatus').textContent = 'Current Saved Image';
    $('#modalImagePreview').classList.remove('hidden');
  } else {
    $('#modalImagePreview').classList.add('hidden');
  }

  modal.classList.remove('hidden');
  $('#modalName').focus();
}

function closeEditModal() {
  $('#editModal').classList.add('hidden');
  if (modalPreviewUrl) {
    URL.revokeObjectURL(modalPreviewUrl);
    modalPreviewUrl = undefined;
  }
}

function setModalImageMode(mode) {
  document.querySelectorAll('.modal-img-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === mode);
  });
  $('#modalTabFile').classList.toggle('hidden', mode !== 'file');
  $('#modalTabUrl').classList.toggle('hidden', mode !== 'url');

  if (mode === 'keep') {
    if (editingProduct?.image) {
      $('#modalPreviewImg').src = editingProduct.image;
      $('#modalPreviewStatus').textContent = 'Current Saved Image';
      $('#modalImagePreview').classList.remove('hidden');
    }
  }
}

// ----------------- Edit in Panel -----------------
function populatePanelForm(product) {
  const form = $('#productForm');
  form.elements.id.value = product.id;
  form.elements.name.value = product.name || '';
  form.elements.category.value = categories.includes(product.category) ? product.category : '';
  form.elements.price.value = product.price ?? '';
  form.elements.description.value = product.description || '';
  updateDescCounter(form.elements.description, $('#descCount'));
  form.elements.url.value = product.url || '';

  $('#formEyebrow').innerHTML = '<i></i> EDITING LISTING';
  $('#formTitle').textContent = 'Edit deal';
  $('#editBannerName').textContent = product.name || 'Untitled Product';
  $('#editBanner').classList.remove('hidden');
  $('#saveProduct').innerHTML = 'Save changes <span>↗</span>';
  $('#cancelEdit').classList.remove('hidden');
  $('#productError').textContent = '';

  // Image preview in panel
  if (product.image) {
    $('#previewImage').src = product.image;
    $('#previewStatus').textContent = 'Current Saved Image';
    $('#imagePreview').classList.remove('hidden');
  }
}

function cancelEdit() {
  editingProduct = null;
  highlightEditingCard(null);
  
  const form = $('#productForm');
  form.reset();
  form.elements.id.value = '';
  updateDescCounter(form.elements.description, $('#descCount'));
  
  $('#formEyebrow').innerHTML = '<i></i> NEW LISTING';
  $('#formTitle').textContent = 'Add a deal';
  $('#editBanner').classList.add('hidden');
  $('#saveProduct').innerHTML = 'Publish product <span>↗</span>';
  $('#cancelEdit').classList.add('hidden');
  $('#productError').textContent = '';
  
  if (panelPreviewUrl) {
    URL.revokeObjectURL(panelPreviewUrl);
    panelPreviewUrl = undefined;
  }
  $('#imagePreview').classList.add('hidden');
  setPanelImageMode('file');
}

function setPanelImageMode(mode) {
  document.querySelectorAll('.img-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === mode);
  });
  $('#tabContentFile').classList.toggle('hidden', mode !== 'file');
  $('#tabContentUrl').classList.toggle('hidden', mode !== 'url');
}

// ----------------- Image Upload Helper -----------------
async function uploadImageFile(file) {
  return await api('/api/admin/images', {
    method: 'POST',
    contentType: file.type,
    body: await file.arrayBuffer()
  });
}

// ----------------- Form Handlers -----------------

// Modal submit handler
$('#modalProductForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!editingProduct) return;
  const submitBtn = $('#modalSaveBtn');
  submitBtn.disabled = true;
  $('#modalError').textContent = '';
  
  let step = 'Preparing update';
  try {
    const activeTab = document.querySelector('.modal-img-tab.active')?.dataset.tab || 'keep';
    let image = editingProduct.image || '';

    if (activeTab === 'file') {
      const file = $('#modalImageFile').files[0];
      if (file && file.size) {
        step = 'Uploading replacement image';
        const upload = await uploadImageFile(file);
        image = upload.image;
      }
    } else if (activeTab === 'url') {
      const urlVal = $('#modalImageUrl').value.trim();
      if (urlVal) {
        if (!/^https?:\/\//i.test(urlVal)) {
          throw new Error('Image URL must start with http:// or https://');
        }
        image = urlVal;
      }
    }

    if (!image) {
      throw new Error('Product must have an image. Choose a file or provide an image link.');
    }

    const payload = {
      id: editingProduct.id,
      name: $('#modalName').value.trim(),
      category: $('#modalCategory').value,
      price: Number($('#modalPrice').value),
      description: $('#modalDesc').value.trim(),
      url: $('#modalUrl').value.trim(),
      image
    };

    if (!payload.name) throw new Error('Product name is required.');
    if (!payload.category) throw new Error('Choose a valid category.');
    if (isNaN(payload.price) || payload.price <= 0) throw new Error('Price must be greater than zero.');
    if (!payload.url) throw new Error('Destination link is required.');

    step = 'Saving product changes';
    await api('/api/admin/products', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    closeEditModal();
    cancelEdit();
    await loadProducts();
    toast(`Deal "${payload.name}" updated successfully.`);
  } catch (error) {
    $('#modalError').textContent = `${step}: ${error.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});

// Panel form submit handler (Add / Edit)
$('#productForm').addEventListener('submit', async event => {
  event.preventDefault();
  const submitBtn = $('#saveProduct');
  submitBtn.disabled = true;
  $('#productError').textContent = '';

  const isEditing = Boolean(editingProduct);
  let step = isEditing ? 'Preparing update' : 'Preparing new listing';

  try {
    const activeTab = document.querySelector('.img-tab.active')?.dataset.tab || 'file';
    let image = isEditing ? (editingProduct.image || '') : '';

    if (activeTab === 'file') {
      const file = $('#productImageFile').files[0];
      if (file && file.size) {
        step = 'Uploading image';
        const upload = await uploadImageFile(file);
        image = upload.image;
      } else if (!image) {
        throw new Error('Please select an image file to upload.');
      }
    } else {
      const urlVal = $('#productImageUrl').value.trim();
      if (urlVal) {
        if (!/^https?:\/\//i.test(urlVal)) {
          throw new Error('Image URL must start with http:// or https://');
        }
        image = urlVal;
      } else if (!image) {
        throw new Error('Please enter a valid image URL.');
      }
    }

    const payload = {
      name: $('#productName').value.trim(),
      category: $('#productCategory').value,
      price: Number($('#productPrice').value),
      description: $('#productDesc').value.trim(),
      url: $('#productUrl').value.trim(),
      image
    };

    if (isEditing) {
      payload.id = editingProduct.id;
    }

    if (!payload.name) throw new Error('Product name is required.');
    if (!payload.category) throw new Error('Choose a valid category.');
    if (isNaN(payload.price) || payload.price <= 0) throw new Error('Price must be greater than zero.');
    if (!payload.url) throw new Error('Destination link is required.');

    step = isEditing ? 'Saving changes' : 'Publishing listing';
    await api('/api/admin/products', {
      method: isEditing ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });

    cancelEdit();
    await loadProducts();
    toast(isEditing ? `Changes to "${payload.name}" saved.` : `"${payload.name}" published to storefront.`);
  } catch (error) {
    $('#productError').textContent = `${step}: ${error.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});

// ----------------- Interactive Listeners -----------------

// Live catalog actions (Edit & Delete)
$('#adminProducts').addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit]');
  if (editButton) {
    const id = editButton.dataset.edit;
    const product = products.find(item => item.id === id);
    if (product) openEditModal(product);
    return;
  }

  const removeButton = event.target.closest('[data-remove]');
  if (removeButton) {
    const id = removeButton.dataset.remove;
    const product = products.find(item => item.id === id);
    const name = product ? product.name : 'this product';
    if (!confirm(`Delete "${name}" from Forex Deals?`)) return;
    
    removeButton.disabled = true;
    try {
      await api('/api/admin/products', {
        method: 'DELETE',
        body: JSON.stringify({ id })
      });
      if (editingProduct && editingProduct.id === id) cancelEdit();
      await loadProducts();
      toast(`Deleted "${name}".`);
    } catch (error) {
      toast(error.message);
      removeButton.disabled = false;
    }
  }
});

// Panel Image Tabs
$('#tabBtnFile').addEventListener('click', () => setPanelImageMode('file'));
$('#tabBtnUrl').addEventListener('click', () => setPanelImageMode('url'));

// Panel File Input Change
$('#productImageFile').addEventListener('change', event => {
  if (panelPreviewUrl) URL.revokeObjectURL(panelPreviewUrl);
  const file = event.target.files[0];
  if (!file) {
    panelPreviewUrl = undefined;
    if (!editingProduct?.image) $('#imagePreview').classList.add('hidden');
    return;
  }
  panelPreviewUrl = URL.createObjectURL(file);
  $('#previewImage').src = panelPreviewUrl;
  $('#previewStatus').textContent = `New File: ${file.name}`;
  $('#imagePreview').classList.remove('hidden');
});

// Panel URL Input
$('#productImageUrl').addEventListener('input', event => {
  const val = event.target.value.trim();
  if (/^https?:\/\//i.test(val)) {
    $('#previewImage').src = val;
    $('#previewStatus').textContent = 'Image URL Preview';
    $('#imagePreview').classList.remove('hidden');
  } else if (!panelPreviewUrl && !editingProduct?.image) {
    $('#imagePreview').classList.add('hidden');
  }
});

// Panel Preview Reset
$('#previewResetBtn').addEventListener('click', () => {
  $('#productImageFile').value = '';
  $('#productImageUrl').value = '';
  if (panelPreviewUrl) {
    URL.revokeObjectURL(panelPreviewUrl);
    panelPreviewUrl = undefined;
  }
  if (editingProduct?.image) {
    $('#previewImage').src = editingProduct.image;
    $('#previewStatus').textContent = 'Current Saved Image';
  } else {
    $('#imagePreview').classList.add('hidden');
  }
});

// Modal Image Tabs
$('#modalTabBtnKeep').addEventListener('click', () => setModalImageMode('keep'));
$('#modalTabBtnFile').addEventListener('click', () => setModalImageMode('file'));
$('#modalTabBtnUrl').addEventListener('click', () => setModalImageMode('url'));

// Modal File Input Change
$('#modalImageFile').addEventListener('change', event => {
  if (modalPreviewUrl) URL.revokeObjectURL(modalPreviewUrl);
  const file = event.target.files[0];
  if (!file) {
    modalPreviewUrl = undefined;
    if (editingProduct?.image) {
      $('#modalPreviewImg').src = editingProduct.image;
      $('#modalPreviewStatus').textContent = 'Current Saved Image';
    }
    return;
  }
  modalPreviewUrl = URL.createObjectURL(file);
  $('#modalPreviewImg').src = modalPreviewUrl;
  $('#modalPreviewStatus').textContent = `New File: ${file.name}`;
  $('#modalImagePreview').classList.remove('hidden');
});

// Modal URL Input
$('#modalImageUrl').addEventListener('input', event => {
  const val = event.target.value.trim();
  if (/^https?:\/\//i.test(val)) {
    $('#modalPreviewImg').src = val;
    $('#modalPreviewStatus').textContent = 'Image URL Preview';
    $('#modalImagePreview').classList.remove('hidden');
  } else if (editingProduct?.image) {
    $('#modalPreviewImg').src = editingProduct.image;
    $('#modalPreviewStatus').textContent = 'Current Saved Image';
  }
});

// Description Counters
$('#productDesc').addEventListener('input', () => updateDescCounter($('#productDesc'), $('#descCount')));
$('#modalDesc').addEventListener('input', () => updateDescCounter($('#modalDesc'), $('#modalDescCount')));

// ----------------- Visitor Traffic & Audience Analytics -----------------
const analyticsState = {
  data: null,
  metric: 'views', // 'views' | 'uniques'
  range: 'today',  // 'today' | 'week' | 'month' | 'year'
  timer: null
};

async function loadAnalytics(silent = false) {
  try {
    const report = await api('/api/admin/analytics');
    analyticsState.data = report;
    updateAnalyticsCards();
    renderAnalyticsChart();
    if (!silent) toast('Visitor traffic analytics updated.');
  } catch (error) {
    if (!silent) toast(`Analytics error: ${error.message}`);
    const stage = $('#chartStage');
    if (stage) stage.innerHTML = `<p class="error">Could not load visitor analytics: ${esc(error.message)}</p>`;
  }
}

function updateAnalyticsCards() {
  if (!analyticsState.data) return;
  const s = analyticsState.data.summary;
  const isUniques = analyticsState.metric === 'uniques';
  const fmt = n => new Intl.NumberFormat('en-IN').format(n || 0);

  // Today
  $('#statTodayCount').textContent = fmt(isUniques ? s.today.uniques : s.today.views);
  $('#statTodayUniques').textContent = `${fmt(s.today.uniques)} unique`;
  $('#statActiveNow').textContent = String(analyticsState.data.live.activeNow || 1);

  // Week
  $('#statWeekCount').textContent = fmt(isUniques ? s.week.uniques : s.week.views);
  $('#statWeekUniques').textContent = `${fmt(s.week.uniques)} unique`;
  $('#statWeekAvg').textContent = `${fmt(s.week.avgDaily)}/day avg`;

  // Month
  $('#statMonthCount').textContent = fmt(isUniques ? s.month.uniques : s.month.views);
  $('#statMonthUniques').textContent = `${fmt(s.month.uniques)} unique`;
  $('#statMonthAvg').textContent = `${fmt(s.month.avgDaily)}/day avg`;

  // Year (1 Year / 365 Days)
  $('#statYearCount').textContent = fmt(isUniques ? s.year.uniques : s.year.views);
  $('#statYearUniques').textContent = `${fmt(s.year.uniques)} unique visitors`;
  $('#statAllTimeCount').textContent = fmt(isUniques ? s.allTime.uniques : s.allTime.views);

  // Insights footer
  $('#insightPeak').textContent = analyticsState.data.live.peakHour || '--:00';
  $('#insightAvg').textContent = `${fmt(s.month.avgDaily)} visitors/day`;
  $('#insightTopMonth').textContent = analyticsState.data.live.topMonth || '--';

  // Legend label
  $('#legendText').textContent = isUniques ? 'Unique Visitors' : 'Total Visits';
}

function renderAnalyticsChart() {
  const stage = $('#chartStage');
  if (!stage) return;
  if (!analyticsState.data) {
    stage.innerHTML = '<p class="chart-loading">Loading visitor statistics…</p>';
    return;
  }

  const range = analyticsState.range;
  const metric = analyticsState.metric;
  const series = analyticsState.data.series[range] || [];

  const titles = {
    today: ["Today's Hourly Traffic (24 Hours)", "Hourly visitor distribution from 00:00 to 23:00"],
    week: ["Last 7 Days Traffic Trend", "Daily visitor breakdown over the past week"],
    month: ["Last 30 Days Visitor Volume", "30-day audience pattern and daily activity"],
    year: ["1-Year Historical Traffic (12 Months)", "Month-by-month audience volume over the past 365 days"]
  };
  const [title, subtitle] = titles[range] || titles.today;
  $('#chartTitle').textContent = title;
  $('#chartSubtitle').textContent = subtitle;

  if (!series.length) {
    stage.innerHTML = '<p class="empty">No visitor data available for this range.</p>';
    return;
  }

  const values = series.map(d => Number(d[metric] || 0));
  const rawMax = Math.max(...values, 0);
  const maxVal = Math.max(5, Math.ceil((rawMax * 1.18) / 5) * 5);

  const w = 840;
  const h = 220;
  const padLeft = 46;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 34;

  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const getX = i => padLeft + (i / (series.length - 1 || 1)) * chartW;
  const getY = val => padTop + chartH - (val / maxVal) * chartH;

  // Gridlines & Y-axis labels
  let gridLines = '';
  const steps = 4;
  for (let s = 0; s < steps; s++) {
    const yVal = Math.round((maxVal / (steps - 1)) * s);
    const yPos = getY(yVal);
    gridLines += `
      <line x1="${padLeft}" y1="${yPos}" x2="${w - padRight}" y2="${yPos}" stroke="#23322b" stroke-dasharray="3,3" stroke-width="1"/>
      <text x="${padLeft - 8}" y="${yPos + 3}" fill="#6b7d73" font-family="'DM Mono', monospace" font-size="8" text-anchor="end">${yVal}</text>
    `;
  }

  // Points & SVG path coordinates
  const points = series.map((item, idx) => ({
    x: getX(idx),
    y: getY(item[metric] || 0),
    item,
    idx
  }));

  // Create smooth bezier path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    pathD += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;

  // X-axis date/time labels
  let xLabels = '';
  const stepInterval = range === 'today' ? 3 : range === 'month' ? 4 : 1;
  points.forEach((p, idx) => {
    if (idx % stepInterval === 0 || idx === points.length - 1) {
      let lbl = p.item.label || p.item.hour || p.item.date || '';
      if (range === 'today') lbl = p.item.hour;
      if (range === 'week') lbl = p.item.day + ' ' + (p.item.label ? p.item.label.split(' ')[0] : '');
      xLabels += `
        <text x="${p.x}" y="${padTop + chartH + 18}" fill="#788a80" font-family="'DM Mono', monospace" font-size="8" text-anchor="middle">${esc(lbl)}</text>
      `;
    }
  });

  // Interactive circles and hit targets
  let circles = '';
  points.forEach((p) => {
    circles += `
      <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#0c1210" stroke="var(--lime)" stroke-width="2"/>
      <circle cx="${p.x}" cy="${p.y}" r="14" fill="transparent" class="chart-hit-circle" data-idx="${p.idx}"/>
    `;
  });

  const svgHtml = `
    <svg viewBox="0 0 ${w} ${h}" class="chart-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#c4ef61" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#c4ef61" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaD}" fill="url(#chartGrad)"/>
      <path d="${pathD}" fill="none" stroke="var(--lime)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${xLabels}
      ${circles}
    </svg>
    <div id="chartTooltip" class="chart-tooltip hidden"></div>
  `;

  stage.innerHTML = svgHtml;

  // Tooltip interaction
  const tooltip = $('#chartTooltip');
  stage.querySelectorAll('.chart-hit-circle').forEach(circle => {
    circle.addEventListener('mouseenter', () => {
      const idx = Number(circle.dataset.idx);
      const p = points[idx];
      if (!p) return;
      const d = p.item;
      let label = d.label || d.date || d.hour || '';
      if (range === 'today') label = `${d.hour} (Today)`;
      if (range === 'week') label = `${d.day}, ${d.label}`;
      if (range === 'year') label = `${d.label} (Monthly)`;

      tooltip.innerHTML = `
        <span>${esc(label)}</span>
        <strong>${metric === 'uniques' ? `${d.uniques || 0} Unique Visitors` : `${d.views || 0} Total Visits`}</strong>
        <small style="color:#788a80;font-size:8px;">${metric === 'uniques' ? `(${d.views || 0} total views)` : `(${d.uniques || 0} unique)`}</small>
      `;

      const rect = stage.getBoundingClientRect();
      const circleRect = circle.getBoundingClientRect();
      const left = circleRect.left - rect.left + circleRect.width / 2;
      const top = circleRect.top - rect.top;

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.classList.remove('hidden');
    });

    circle.addEventListener('mouseleave', () => {
      tooltip.classList.add('hidden');
    });
  });
}

// Analytics Toggles Listeners
$('#rangeToggle').addEventListener('click', event => {
  const btn = event.target.closest('[data-range]');
  if (!btn) return;
  analyticsState.range = btn.dataset.range;
  document.querySelectorAll('#rangeToggle .toggle-btn').forEach(b => {
    b.classList.toggle('active', b === btn);
  });
  renderAnalyticsChart();
});

$('#metricToggle').addEventListener('click', event => {
  const btn = event.target.closest('[data-metric]');
  if (!btn) return;
  analyticsState.metric = btn.dataset.metric;
  document.querySelectorAll('#metricToggle .toggle-btn').forEach(b => {
    b.classList.toggle('active', b === btn);
  });
  updateAnalyticsCards();
  renderAnalyticsChart();
});

$('#refreshAnalytics').addEventListener('click', () => {
  loadAnalytics(false);
});

// Modal Close Controls
$('#modalCloseBtn').addEventListener('click', closeEditModal);
$('#modalCancelBtn').addEventListener('click', closeEditModal);
$('#editModal').addEventListener('click', event => {
  if (event.target === $('#editModal')) closeEditModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#editModal').classList.contains('hidden')) {
    closeEditModal();
  }
});

// Cancel buttons
$('#cancelEdit').addEventListener('click', cancelEdit);
$('#bannerCancelBtn').addEventListener('click', cancelEdit);

// Auth & Dashboard
async function showDashboard(event) {
  event.preventDefault();
  const button = $('#enterAdmin');
  button.disabled = true;
  $('#loginError').textContent = '';
  state.password = $('#adminPassword').value.trim();
  try {
    await api('/api/admin/products');
    $('#gate').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');
    await Promise.all([loadProducts(), loadAnalytics(true)]);

    // Start 30s auto-refresh for live visitor traffic
    clearInterval(analyticsState.timer);
    analyticsState.timer = setInterval(() => loadAnalytics(true), 30000);
  } catch (error) {
    state.password = '';
    $('#loginError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

$('#adminLogin').addEventListener('submit', showDashboard);
$('#refresh').addEventListener('click', () => {
  loadProducts();
  loadAnalytics(true);
});
$('#lockButton').addEventListener('click', () => {
  state.password = '';
  $('#adminPassword').value = '';
  clearInterval(analyticsState.timer);
  $('#dashboard').classList.add('hidden');
  $('#gate').classList.remove('hidden');
});

