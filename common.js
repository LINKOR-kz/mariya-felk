/* Общие данные и функции сайта и админки Mariya Felk */
(function (w) {
  'use strict';

  /* Сервер (Cloudflare Worker): каталог, фото, видео и заказы */
  var API = 'https://mariya-felk-admin.sentora-admin-worker.workers.dev';
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]api=local/.test(location.search)) API = 'http://127.0.0.1:8787';

  /* Готовые сетки размеров */
  var SIZE_PRESETS = {
    letters: { name: 'XS–XL', list: ['XS', 'S', 'M', 'L', 'XL'] },
    ru: { name: '40–52', list: ['40', '42', '44', '46', '48', '50', '52'] },
    duo: { name: 'S-M / L-XL', list: ['S-M', 'L-XL'] },
    shoes: { name: 'Обувь 35–41', list: ['35', '36', '37', '38', '39', '40', '41'] },
    one: { name: 'Один размер', list: ['ONE SIZE'] }
  };
  var TAGS = { new: 'Новинка', hit: 'Хит', last: 'Последний', sale: 'Скидка' };
  var STATUSES = {
    new: { name: 'Новый', color: '#E8508A' },
    confirmed: { name: 'Подтверждён', color: '#7A5AF8' },
    paid: { name: 'Оплачен', color: '#12B76A' },
    sent: { name: 'Отправлен', color: '#0BA5EC' },
    done: { name: 'Выполнен', color: '#475467' },
    cancelled: { name: 'Отменён', color: '#98A2B3' }
  };
  var DELIVERY = { pickup: 'Самовывоз из магазина', city: 'Доставка по Караганде / Михайловке', post: 'Казпочта по Казахстану' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return (Math.round(+n) || 0).toLocaleString('ru-RU').replace(/[  ]/g, ' ') + ' ₸'; }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function phoneFmt(s) {
    var d = digits(s); if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    if (d.length !== 11) return s || '';
    return '+' + d[0] + ' ' + d.slice(1, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9);
  }
  function wa(phone, text) { var d = digits(phone); if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1); return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : ''); }

  /* ---------- Каталог: сначала с сервера, если пусто или нет связи — из файла на сайте ---------- */
  function fileCatalog() { return fetch('data/catalog.json?t=' + Date.now()).then(function (r) { return r.json(); }); }
  function loadCatalog() {
    var ctl = w.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 5000);
    return fetch(API + '/catalog', { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('empty'); return r.json(); })
      .then(function (d) { return { data: d, server: true }; })
      .catch(function () { clearTimeout(t); return fileCatalog().then(function (d) { return { data: d, server: false }; }); });
  }

  /* ---------- Файлы: kv:<id> — файл на сервере, остальное — файл на сайте ---------- */
  function src(ref) {
    if (!ref) return '';
    if (ref.indexOf('kv:') === 0) return API + '/m/' + ref.slice(3);
    return ref;
  }

  function uploadFile(blob, token, onProgress) {
    var type = blob.type || 'application/octet-stream';
    if (type === 'video/x-m4v') type = 'video/mp4';
    var h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
    function call(path, opts) {
      return fetch(API + path, opts).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || ('Ошибка ' + r.status)); e.status = r.status; throw e; } return j; });
      });
    }
    return call('/admin/upload/start', { method: 'POST', headers: h, body: JSON.stringify({ type: type, size: blob.size }) }).then(function (s) {
      var i = 0;
      function next() {
        if (i >= s.parts) return call('/admin/upload/' + s.id + '/finish', { method: 'POST', headers: h, body: JSON.stringify({ type: type, size: blob.size }) });
        var part = blob.slice(i * s.chunk, Math.min(blob.size, (i + 1) * s.chunk));
        return call('/admin/upload/' + s.id + '/' + i, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: part })
          .then(function () { i++; if (onProgress) onProgress(i / s.parts); return next(); });
      }
      return next();
    }).then(function (f) { return f.ref; });
  }

  /* Сжатие фото перед загрузкой */
  function compressImage(file, max) {
    max = max || 1600;
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('Не удалось обработать фото')); }, 'image/webp', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('Не удалось открыть фото')); };
      img.src = u;
    });
  }

  /* ---------- Цены и акции (так же считает сервер при заказе) ---------- */
  function today() { var d = new Date(Date.now() + 5 * 3600e3); return d.toISOString().slice(0, 10); }
  function promoLive(p) {
    if (!p || !p.active) return false;
    var t = today();
    if (p.from && t < p.from) return false;
    if (p.to && t > p.to) return false;
    return true;
  }
  function promoHits(p, it) {
    if (!(+p.percent > 0) || !p.applyTo || p.applyTo === 'none') return false;
    if (p.applyTo === 'all') return true;
    if (p.applyTo === 'cat') return (p.cats || []).indexOf(it.cat) >= 0;
    if (p.applyTo === 'items') return (p.items || []).indexOf(it.id) >= 0;
    return false;
  }
  function pricing(it, promos) {
    var base = +it.price || 0, best = 0;
    (promos || []).forEach(function (p) { if (promoLive(p) && promoHits(p, it) && +p.percent > best) best = +p.percent; });
    var price = best ? Math.round(base * (100 - best) / 100 / 10) * 10 : base;
    var old = best ? (+it.oldPrice > base ? +it.oldPrice : base) : (+it.oldPrice > base ? +it.oldPrice : 0);
    return { price: price, old: old, off: old ? Math.round((1 - price / old) * 100) : 0, promo: best };
  }
  function inStock(it) { var s = it.sizes || []; return !s.length || s.some(function (x) { return +x.q > 0; }); }

  /* ---------- Графика: «мышиные ушки» и логотип ---------- */
  function ears(cls) {
    return '<svg class="' + (cls || 'ears') + '" viewBox="0 0 100 90" aria-hidden="true"><circle cx="22" cy="22" r="20"/><circle cx="78" cy="22" r="20"/><circle cx="50" cy="56" r="33"/></svg>';
  }
  function logo(light) {
    return '<span class="logo' + (light ? ' logo-light' : '') + '">' + ears('logo-ears') + '<span class="logo-txt"><b>Mariya</b><i>Felk</i></span></span>';
  }
  var ICONS = {
    coat: '<path d="M8 3h8l3 4v14h-4v-7h-6v7H5V7z"/><path d="M12 3v11"/>',
    puffer: '<path d="M7 4h10l2 3v14H5V7z"/><path d="M5 10h14M5 14h14M5 18h14M12 4v17"/>',
    sweat: '<path d="M8 4h8l5 4-2 4-3-2v11H8V10l-3 2-2-4z"/>',
    top: '<path d="M7 5c2 2 8 2 10 0l1 6-2 10H8L6 11z"/>',
    pants: '<path d="M7 3h10l1 18h-4l-2-11-2 11H6z"/>',
    shoe: '<path d="M3 16c0-3 1-9 3-11 2 4 5 6 9 7 4 1 6 2 6 4v2H3z"/>',
    bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    all: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'
  };
  function icon(name) { return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + (ICONS[name] || ICONS.all) + '</svg>'; }

  w.MF = {
    API: API, SIZE_PRESETS: SIZE_PRESETS, TAGS: TAGS, STATUSES: STATUSES, DELIVERY: DELIVERY, ICONS: ICONS,
    esc: esc, money: money, norm: norm, uid: uid, digits: digits, nl2br: nl2br, phoneFmt: phoneFmt, wa: wa,
    loadCatalog: loadCatalog, src: src, uploadFile: uploadFile, compressImage: compressImage,
    pricing: pricing, promoLive: promoLive, inStock: inStock, ears: ears, logo: logo, icon: icon
  };
})(window);
