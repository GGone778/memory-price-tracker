/**
 * 内存条价格追踪 - 应用逻辑
 * 路由、页面渲染、图表管理、对比工具
 */

(function() {
  'use strict';

  // =============================================
  // State
  // =============================================
  const state = {
    currentView: 'home',
    category: 'all',
    sort: 'default',
    selectedProducts: [],   // for trends chart
    compareList: [],        // for compare page
    chartInstances: {}      // managed chart instances
  };

  // =============================================
  // DOM refs
  // =============================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // =============================================
  // Utility
  // =============================================
  function renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    let s = '';
    for (let i = 0; i < full; i++) s += '★';
    if (half) s += '☆';
    return '<span class="stars">' + s + '</span> <span style="font-size:0.8rem;color:var(--text-secondary)">' + rating + '</span>';
  }

  function formatDate(monthStr) {
    const parts = monthStr.split('-');
    return parts[1] + '月';
  }

  // 生成购买链接（淘宝 / 天猫 / 拼多多）
  function generatePurchaseLinks(p) {
    const keyword = encodeURIComponent(p.brand.split(' ')[0] + ' ' + p.name + ' ' + p.specs.speed + ' ' + p.specs.capacity + 'GB');
    const price = p.currentPrice;
    const affiliateLinks = p.affiliateLinks || {};
    return [
      { platform: '淘宝', price: price, url: affiliateLinks.taobao || 'https://s.taobao.com/search?q=' + keyword },
      { platform: '天猫', price: Math.round(price * 1.02), url: affiliateLinks.tmall || 'https://list.tmall.com/search_product.htm?q=' + keyword },
      { platform: '拼多多', price: Math.round(price * 0.95), url: 'https://mobile.yangkeduo.com/search_result.html?keyword=' + keyword }
    ];
  }

  // =============================================
  // Navigation
  // =============================================
  function navigate(view, params) {
    state.currentView = view;
    // update nav
    $$('.nav-links a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
    // show view
    $$('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + view);
    if (el) el.classList.add('active');
    // render
    switch (view) {
      case 'home': renderHome(); break;
      case 'products': renderProducts(); break;
      case 'detail': renderDetail(params); break;
      case 'trends': renderTrends(); break;
      case 'compare': renderCompare(); break;
    }
    window.scrollTo(0, 0);
  }

  function initRouter() {
    function handleHash() {
      const hash = location.hash.slice(1) || 'home';
      if (hash === 'home') { navigate('home'); return; }
      if (hash === 'products') { navigate('products'); return; }
      if (hash === 'trends') { navigate('trends'); return; }
      if (hash === 'compare') { navigate('compare'); return; }
      if (hash.startsWith('product/')) {
        const id = hash.replace('product/', '');
        navigate('detail', id);
        return;
      }
      navigate('home');
    }
    window.addEventListener('hashchange', handleHash);
    handleHash();
  }

  function uniqueByBrand(products) {
    const seen = {};
    return products.filter(p => {
      const brandKey = p.brand.replace(/\(.*\)/, '').trim();
      if (seen[brandKey]) return false;
      seen[brandKey] = true;
      return true;
    });
  }

  // =============================================
  // Home View
  // =============================================
  function renderHome() {
    const container = document.getElementById('view-home');
    if (!container) return;
    const mi = RAMData.marketIndex;
    const allBrands = uniqueByBrand(RAMData.products);

    container.innerHTML = `
      <div class="search-wrap" id="home-search-wrap">
        <input type="text" class="search-input" id="home-search" placeholder="搜索内存条品牌、型号或规格..." autocomplete="off">
        <div class="search-results" id="home-search-results"></div>
      </div>
      <div class="market-overview">
        <div class="market-card">
          <div class="label">DDR4 市场指数</div>
          <div class="value">${mi.ddr4.current}</div>
          <div class="change ${mi.ddr4.change > 0 ? 'up' : 'down'}">
            ${mi.ddr4.change > 0 ? '↑' : '↓'} ${Math.abs(mi.ddr4.change)}%
          </div>
        </div>
        <div class="market-card">
          <div class="label">DDR5 市场指数</div>
          <div class="value">${mi.ddr5.current}</div>
          <div class="change ${mi.ddr5.change > 0 ? 'up' : 'down'}">
            ${mi.ddr5.change > 0 ? '↑' : '↓'} ${Math.abs(mi.ddr5.change)}%
          </div>
        </div>
        <div class="market-card">
          <div class="label">综合市场指数</div>
          <div class="value">${mi.overall.current}</div>
          <div class="change ${mi.overall.change > 0 ? 'up' : 'down'}">
            ${mi.overall.change > 0 ? '↑' : '↓'} ${Math.abs(mi.overall.change)}%
          </div>
        </div>
      </div>

      <div class="section-title">🏷️ 所有品牌</div>
      <div class="product-grid">
        ${allBrands.map(p => renderProductCard(p)).join('')}
      </div>
    `;
    // Bind search
    bindHomeSearch();
  }

  // =============================================
  // Home Search
  // =============================================
  function bindHomeSearch() {
    const input = document.getElementById('home-search');
    const results = document.getElementById('home-search-results');
    if (!input || !results) return;

    let timer = null;
    input.addEventListener('input', function() {
      clearTimeout(timer);
      timer = setTimeout(() => doSearch(this.value, results), 150);
    });

    input.addEventListener('focus', function() {
      if (this.value.length >= 1) {
        results.classList.add('visible');
      }
    });

    document.addEventListener('click', function(e) {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.classList.remove('visible');
      }
    });
  }

  function doSearch(query, resultsEl) {
    const q = query.trim().toLowerCase();
    if (!q) { resultsEl.classList.remove('visible'); resultsEl.innerHTML = ''; return; }

    const hits = RAMData.products.filter(p => {
      const brand = p.brand.toLowerCase();
      const name = p.name.toLowerCase();
      const type = p.specs.type.toLowerCase();
      const speed = p.specs.speed.toLowerCase();
      const chip = p.specs.chip.toLowerCase();
      const timing = (p.specs.timing || '').toLowerCase();
      const cas = 'cl' + (p.specs.timingRaw ? p.specs.timingRaw.cas : '');
      const searchText = brand + ' ' + name + ' ' + type + ' ' + speed + ' ' + chip + ' ' + timing + ' ' + cas;
      return searchText.includes(q);
    }).slice(0, 8);

    if (!hits.length) {
      resultsEl.innerHTML = '<div class="search-empty">未找到匹配产品</div>';
      resultsEl.classList.add('visible');
      return;
    }

    resultsEl.innerHTML = hits.map(p => {
      const color = RAMData.getBrandColor(p.brand);
      const changeClass = p.changePercent >= 0 ? 'up' : 'down';
      const changeArrow = p.changePercent >= 0 ? '↑' : '↓';
      return '<div class="search-result-item" onclick="location.hash=\'product/' + p.id + '\';document.getElementById(\'home-search\').value=\'\'">' +
        '<div class="search-result-color" style="background:' + color + '">' + p.brand.charAt(0) + '</div>' +
        '<div class="search-result-info">' +
          '<div class="search-result-brand">' + p.brand + '</div>' +
          '<div class="search-result-name">' + p.name + ' ' + p.specs.speed + ' ' + p.specs.sticks + '</div>' +
          '<div class="search-result-specs">' + p.specs.chip + ' / ' + p.specs.timing + '</div>' +
        '</div>' +
        '<div class="search-result-price">' + RAMData.formatPrice(p.currentPrice) + '</div>' +
      '</div>';
    }).join('');
    resultsEl.classList.add('visible');
  }

  // =============================================
  // Product List View
  // =============================================
  function renderProducts() {
    const container = document.getElementById('view-products');
    if (!container) return;
    const filtered = RAMData.getProductsByType(state.category);
   const sorted = RAMData.sortProducts(filtered, state.sort);
    const deduped = uniqueByBrand(sorted);

    container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-tabs">
          ${RAMData.categories.map(c =>
            `<button class="${c.id === state.category ? 'active' : ''}" data-cat="${c.id}">${c.label}</button>`
          ).join('')}
        </div>
        <div class="toolbar-sort">
          <select id="sort-select">
            ${RAMData.sortOptions.map(o =>
              `<option value="${o.id}" ${o.id === state.sort ? 'selected' : ''}>${o.label}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="product-grid">
        ${deduped.map(p => renderProductCard(p)).join('')}
      </div>
    `;

    // Bind filter tabs
    container.querySelectorAll('.toolbar-tabs button').forEach(btn => {
      btn.addEventListener('click', function() {
        state.category = this.dataset.cat;
        renderProducts();
      });
    });

    // Bind sort
    container.querySelector('#sort-select').addEventListener('change', function() {
      state.sort = this.value;
      renderProducts();
    });
  }

  // =============================================
  // Product Card (shared component)
  // =============================================
 function renderProductCard(p) {
    const color = RAMData.getBrandColor(p.brand);
    return `
      <div class="product-card" onclick="location.hash='product/${p.id}'">
        <div class="product-card-image" style="background:linear-gradient(135deg,${color},${color}88);">
          ${p.brand.split(' ')[0]}
          ${p.hot ? '<span class="badge">热门</span>' : ''}
        </div>
        <div class="product-card-body">
          <div class="product-card-brand">${p.brand}</div>
          <div class="product-card-name">${p.name}</div>
          <div class="product-card-specs">${p.specs.type} ${p.specs.speed} / ${p.specs.sticks}</div>
          <div class="product-card-footer">
            <div class="product-card-rating">${renderStars(p.rating)} · ${(p.reviews/1000).toFixed(1)}k 评价</div>
          </div>
        </div>
      </div>
    `;
  }

  // =============================================
  // Product Detail View
  // =============================================
  function renderDetail(id) {
    const container = document.getElementById('view-detail');
    if (!container) return;
    const p = RAMData.getProduct(id);
    if (!p) {
      container.innerHTML = '<div class="loading">产品未找到</div>';
      return;
    }

    const color = RAMData.getBrandColor(p.brand);
    const changeClass = p.changePercent >= 0 ? 'up' : 'down';
    const changeArrow = p.changePercent >= 0 ? '↑' : '↓';
    const absChange = Math.abs(p.changePercent);
    const specEntries = [
      ['内存类型', p.specs.type],
      ['频率', p.specs.speed],
      ['容量', p.specs.capacity],
      ['内存颗粒', p.specs.chip],
      ['时序', p.specs.timing],
      ['CAS延迟', 'CL' + p.specs.timingRaw.cas],
      ['电压', p.specs.voltage],
      ['形态规格', p.specs.formFactor],
      ['针脚', p.specs.pins + 'pin'],
      ['质保', p.specs.warranty]
    ];
    const related = RAMData.getRelatedProducts(id, 3);
    const purchaseLinks = generatePurchaseLinks(p);

    container.innerHTML = `
      <div style="margin-bottom:12px;">
        <a href="#" onclick="history.back();return false;" class="back-btn">← 返回</a>
      </div>
      <div class="detail-header">
        <div class="detail-breadcrumb">
          <a href="#" onclick="location.hash='home';return false;">首页</a> ›
          <a href="#" onclick="location.hash='products';return false;">产品列表</a> ›
          ${p.brand} ${p.name}
        </div>
        <div class="detail-top">
          <div class="detail-image" style="background:linear-gradient(135deg,${color},${color}88);">
            ${p.brand.split(' ')[0]}
          </div>
          <div class="detail-info">
            <div class="detail-info-brand">${p.brand}</div>
            <div class="detail-info-name">${p.name} ${p.specs.speed} ${p.specs.sticks}</div>
            <div class="detail-info-desc">${p.description}</div>
            <div class="detail-price-row">
              <div class="detail-price-current">${RAMData.formatPrice(p.currentPrice)}</div>
              <div class="detail-price-range">
                <div class="detail-price-range-item">
                  <div class="val">${RAMData.formatPrice(p.lowestPrice30d)}</div>
                  <div class="lbl">30日最低</div>
                </div>
                <div class="detail-price-range-item">
                  <div class="val">${RAMData.formatPrice(p.highestPrice30d)}</div>
                  <div class="lbl">30日最高</div>
                </div>
              </div>
              <div class="detail-change-badge ${changeClass}">${changeArrow} ${absChange.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-card">
          <div class="detail-card-title">📋 详细规格</div>
          <table class="specs-table">
            ${specEntries.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
          </table>
        </div>
        <div class="detail-card">
          <div class="detail-card-title">✨ 产品特点</div>
          <div class="feature-list">
            ${p.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
          </div>
          <div style="margin-top:16px;">
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:4px;">评分</div>
            <div>${renderStars(p.rating)} · ${(p.reviews/1000).toFixed(1)}k 评价</div>
          </div>
        </div>
      </div>

     <div class="detail-card" style="margin-bottom:20px;">
       <div class="detail-card-title">📈 价格走势（近12个月）</div>
       <div class="chart-container">
         <canvas id="detail-chart"></canvas>
       </div>
     </div>
      <div class="detail-card" style="margin-bottom:20px;">
        <div class="detail-card-title">🛒 购买渠道</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${purchaseLinks.map(link => `
            <a href="${link.url}" target="_blank" rel="noopener" class="purchase-btn ${link.platform === '京东' ? 'purchase-btn-jd' : link.platform === '天猫' ? 'purchase-btn-tb' : 'purchase-btn-pdd'}">
              <span>${link.platform}</span>
              <span style="font-size:1.1rem;">${RAMData.formatPrice(link.price)}</span>
              <span class="go">去购买 →</span>
            </a>
          `).join('')}
        </div>
      </div>

      ${related.length ? `
      <div class="detail-card" style="margin-bottom:20px;">
        <div class="detail-card-title">🔗 同类推荐</div>
        <div class="related-grid">
          ${related.map(r => `
            <div class="related-item" onclick="location.hash='product/${r.id}'">
              <div class="related-item-brand">${r.brand}</div>
              <div class="related-item-name">${r.name}</div>
              <div class="related-item-price">${RAMData.formatPrice(r.currentPrice)}</div>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    `;

    // Draw chart after DOM update
    setTimeout(() => drawDetailChart(id), 50);
  }

  function drawDetailChart(id) {
    const canvas = document.getElementById('detail-chart');
    if (!canvas) return;
    const history = RAMData.getPriceHistory(id);
    if (!history.length) return;
    const ctx = canvas.getContext('2d');
    // Destroy previous chart if exists
    if (state.chartInstances.detail) { state.chartInstances.detail.destroy(); }
    state.chartInstances.detail = new Chart(ctx, {
      type: 'line',
      data: {
        labels: history.map(h => h.month),
        datasets: [{
          label: RAMData.getProduct(id).brand + ' ' + RAMData.getProduct(id).name,
          data: history.map(h => h.price),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#2563eb'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => '¥' + ctx.parsed.y
            }
          }
        },
        scales: {
          y: {
            ticks: { callback: v => '¥' + v },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  // =============================================
  // Trends View
  // =============================================
  function renderTrends() {
    const container = document.getElementById('view-trends');
    if (!container) return;

    container.innerHTML = `
      <div class="trends-controls">
        <div class="label">选择要对比的产品（点击添加，最多5个）</div>
        <div class="trends-selector" id="trends-selector">
          ${RAMData.products.map(p => {
            const selected = state.selectedProducts.includes(p.id);
            return `<span class="trend-chip ${selected ? 'selected' : ''}" data-id="${p.id}">
              ${p.brand.split(' ')[0]} ${p.name}
              ${selected ? '<span class="remove" data-id="' + p.id + '">×</span>' : ''}
            </span>`;
          }).join('')}
        </div>
        <div style="font-size:0.8rem;color:var(--text-secondary);">
          已选 ${state.selectedProducts.length} 个
          ${state.selectedProducts.length ? ' | <a href="#" id="clear-trends">清空选择</a>' : ''}
        </div>
      </div>
      <div class="trends-chart-box">
        ${state.selectedProducts.length
          ? '<div class="chart-container"><canvas id="trends-chart"></canvas></div>'
          : '<div class="compare-empty"><p>👆 点击上方产品名称查看价格走势</p></div>'
        }
      </div>
    `;

    // Bind chip clicks
    container.querySelectorAll('.trend-chip').forEach(chip => {
      chip.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove')) {
          state.selectedProducts = state.selectedProducts.filter(id => id !== e.target.dataset.id);
        } else {
          const id = this.dataset.id;
          if (state.selectedProducts.includes(id)) {
            state.selectedProducts = state.selectedProducts.filter(v => v !== id);
          } else if (state.selectedProducts.length < 5) {
            state.selectedProducts.push(id);
          }
        }
        renderTrends();
      });
    });

    const clearBtn = container.querySelector('#clear-trends');
    if (clearBtn) {
      clearBtn.addEventListener('click', function(e) {
        e.preventDefault();
        state.selectedProducts = [];
        renderTrends();
      });
    }

    if (state.selectedProducts.length) {
      setTimeout(drawTrendsChart, 50);
    }
  }

  function drawTrendsChart() {
    const canvas = document.getElementById('trends-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (state.chartInstances.trends) { state.chartInstances.trends.destroy(); }

    const colors = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6'];
    const datasets = state.selectedProducts.map((id, i) => {
      const p = RAMData.getProduct(id);
      const history = RAMData.getPriceHistory(id);
      return {
        label: p.brand.split(' ')[0] + ' ' + p.name,
        data: history.map(h => h.price),
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length] + '18',
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: colors[i % colors.length]
      };
    });

    const labels = RAMData.getPriceHistory(state.selectedProducts[0]).map(h => h.month);

    state.chartInstances.trends = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: { label: (ctx) => ctx.dataset.label + ': ¥' + ctx.parsed.y }
          }
        },
        scales: {
          y: { ticks: { callback: v => '¥' + v }, grid: { color: 'rgba(0,0,0,0.06)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // =============================================
  // Compare View
  // =============================================
  function renderCompare() {
    const container = document.getElementById('view-compare');
    if (!container) return;

    container.innerHTML = `
      <div class="compare-selector">
        <input type="text" class="compare-search" id="compare-search" placeholder="搜索产品名称或品牌..." />
        <div class="compare-search-results" id="compare-results">
          ${RAMData.products.map(p => `
            <span class="compare-option ${state.compareList.includes(p.id) ? 'selected' : ''}" data-id="${p.id}">
              ${p.brand.split(' ')[0]} ${p.name} ${RAMData.formatPrice(p.currentPrice)}
            </span>
          `).join('')}
        </div>
        <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:8px;">
          已选 ${state.compareList.length} 个
          ${state.compareList.length ? ' | <a href="#" id="clear-compare">清空全部</a>' : ''}
        </div>
      </div>

      ${state.compareList.length >= 2
        ? `
        <div class="compare-table-wrap">
          <table class="compare-table">
            <thead><tr><th>参数</th>
              ${state.compareList.map(id => {
                const p = RAMData.getProduct(id);
                return `<th>${p.brand.split(' ')[0]}<br>${p.name}<br><button class="remove-btn" data-id="${id}">移除</button></th>`;
              }).join('')}
            </tr></thead>
            <tbody>
              ${['当前价格', '内存类型', '频率', '容量', '内存颗粒', '时序', 'CAS延迟', '电压', '30日最低', '30日最高', '近月涨跌', '评分'].map(key => {
                return `<tr><td>${key}</td>
                  ${state.compareList.map(id => {
                    const p = RAMData.getProduct(id);
                    let val = '';
                    switch (key) {
                      case '当前价格': val = RAMData.formatPrice(p.currentPrice); break;
                      case '内存类型': val = p.specs.type; break;
                      case '频率': val = p.specs.speed; break;
                      case '容量': val = p.specs.capacity + ' (' + p.specs.sticks + ')'; break;
                      case '内存颗粒': val = p.specs.chip; break;
                      case '时序': val = p.specs.timing; break;
                      case 'CAS延迟': val = 'CL' + p.specs.timingRaw.cas; break;
                      case '电压': val = p.specs.voltage; break;
                      case '30日最低': val = RAMData.formatPrice(p.lowestPrice30d); break;
                      case '30日最高': val = RAMData.formatPrice(p.highestPrice30d); break;
                      case '近月涨跌': val = RAMData.formatChange(p.changePercent); break;
                      case '评分': val = '★ ' + p.rating + ' (' + (p.reviews/1000).toFixed(1) + 'k)'; break;
                    }
                    return `<td>${val}</td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="compare-chart-box">
          <div class="detail-card-title">📈 价格走势对比</div>
          <div class="chart-container"><canvas id="compare-chart"></canvas></div>
        </div>`
        : '<div class="compare-empty"><p>👆 选择至少 2 款产品进行对比</p><p style="font-size:0.85rem;">最多可选 6 款产品同时对比</p></div>'
      }
    `;

    // Search
    const searchInput = container.querySelector('#compare-search');
    const resultsDiv = container.querySelector('#compare-results');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        const q = this.value.toLowerCase();
        resultsDiv.innerHTML = RAMData.products
          .filter(p => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.specs.type.toLowerCase().includes(q))
          .map(p => `<span class="compare-option ${state.compareList.includes(p.id) ? 'selected' : ''}" data-id="${p.id}">
            ${p.brand.split(' ')[0]} ${p.name} ${RAMData.formatPrice(p.currentPrice)}
          </span>`).join('');
        bindCompareOptions(resultsDiv);
      });
    }

    bindCompareOptions(resultsDiv);

    // Remove from table
    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        state.compareList = state.compareList.filter(id => id !== this.dataset.id);
        renderCompare();
      });
    });

    const clearBtn = container.querySelector('#clear-compare');
    if (clearBtn) {
      clearBtn.addEventListener('click', function(e) {
        e.preventDefault();
        state.compareList = [];
        renderCompare();
      });
    }

    if (state.compareList.length >= 2) {
      setTimeout(drawCompareChart, 50);
    }
  }

  function bindCompareOptions(container) {
    container.querySelectorAll('.compare-option').forEach(el => {
      el.addEventListener('click', function() {
        const id = this.dataset.id;
        if (state.compareList.includes(id)) {
          state.compareList = state.compareList.filter(v => v !== id);
        } else if (state.compareList.length < 6) {
          state.compareList.push(id);
        }
        renderCompare();
      });
    });
  }

  function drawCompareChart() {
    const canvas = document.getElementById('compare-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (state.chartInstances.compare) { state.chartInstances.compare.destroy(); }

    const colors = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899'];
    const datasets = state.compareList.map((id, i) => {
      const p = RAMData.getProduct(id);
      const history = RAMData.getPriceHistory(id);
      return {
        label: p.brand.split(' ')[0] + ' ' + p.name,
        data: history.map(h => h.price),
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length] + '18',
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: colors[i % colors.length]
      };
    });

    const labels = RAMData.getPriceHistory(state.compareList[0]).map(h => h.month);

    state.chartInstances.compare = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: { label: (ctx) => ctx.dataset.label + ': ¥' + ctx.parsed.y }
          }
        },
        scales: {
          y: { ticks: { callback: v => '¥' + v }, grid: { color: 'rgba(0,0,0,0.06)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // =============================================
  // Init
  // =============================================
  function init() {
    // Nav clicks
    $$('.nav-links a').forEach(a => {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        location.hash = this.dataset.view;
      });
    });

    initRouter();
  }

  document.addEventListener('DOMContentLoaded', init);
})();




