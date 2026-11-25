/* Mariya Felk — витрина, корзина, оформление заказа */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = MF.esc, money = MF.money;

  var D = null, fromServer = false;
  var cat = 'all', q = '', sort = '';
  var CART_KEY = 'mf-cart', FORM_KEY = 'mf-form';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  var cart = []; try { cart = JSON.parse(store(CART_KEY) || '[]') || []; } catch (e) { cart = []; }

  var tt;
  function toast(msg, kind) { var t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + (kind || ''); clearTimeout(tt); tt = setTimeout(function () { t.className = 'toast'; }, kind === 'err' ? 4500 : 2200); }

  /* ---------- загрузка ---------- */
  MF.loadCatalog().then(function (r) {
    D = r.data; fromServer = r.server;
    D.items = (D.items || []).filter(function (i) { return i.status !== 'hidden'; });
    renderStatic(); renderCats(); renderPromos(); renderGrid(); renderReels(); syncCart(); openFromHash();
  }).catch(function () { $('#grid').innerHTML = '<div class="empty">Не удалось загрузить каталог. Обновите страницу.</div>'; });

  var S = function () { return D.settings || {}; };
  function itemById(id) { return D.items.filter(function (x) { return x.id === id; })[0]; }
  function catById(id) { return (D.cats || []).filter(function (x) { return x.id === id; })[0]; }

  /* ---------- статичные блоки из настроек ---------- */
  function renderStatic() {
    var s = S();
    $('#hdrLogo').innerHTML = MF.logo();
    $('#ftrLogo').innerHTML = MF.logo();
    $('#year').textContent = new Date().getFullYear();
    if (s.notice) $('#notice').textContent = s.notice; else $('#notice').hidden = true;
    if (s.heroTitle) {
      var lines = s.heroTitle.split('\n');
      $('#heroTitle').innerHTML = esc(lines[0]) + (lines[1] ? '<br><em>' + esc(lines.slice(1).join(' ')) + '</em>' : '');
    }
    $('#heroText').textContent = s.heroText || '';
    $('#aboutText').innerHTML = String(s.about || '').split(/\n\s*\n/).map(function (p) { return '<p>' + MF.nl2br(p) + '</p>'; }).join('');
    var waText = 'Здравствуйте! Пишу с сайта Mariya Felk.';
    $('#heroWa').href = MF.wa(s.whatsapp, waText);
    $('#cWaBtn').href = MF.wa(s.whatsapp, waText);
    $('#cWa').href = MF.wa(s.whatsapp); $('#cWa').textContent = MF.phoneFmt(s.whatsapp);
    $('#cIg').href = 'https://instagram.com/' + (s.instagram || ''); $('#cIg').textContent = '@' + (s.instagram || '');
    $('#cAddr').textContent = (s.city ? s.city + ', ' : '') + (s.address || '');
    $('#cHours').textContent = s.hours || '';
    $('#cMap').href = 'https://2gis.kz/karaganda/search/' + encodeURIComponent((s.address || '').replace(/[«»]/g, '') + ' ' + (s.city || ''));
    $('#deliveryList').innerHTML = (s.delivery || []).map(function (d, i) {
      return '<div class="dl-item"><span class="dl-n">' + (i + 1) + '</span><div><b>' + esc(d.t) + '</b><span>' + esc(d.d) + '</span></div></div>';
    }).join('');
    var words = ['Шубы', 'Пуховики', 'Оверсайз', 'Kaspi Red', 'Доставка 0 ₸', 'Примерка дома', 'Новинки каждый день'];
    var one = '<span>' + words.map(function (w) { return esc(w) + '<i>◆</i>'; }).join('') + '</span>';
    $('#ticker').innerHTML = one + one;
  }

  /* ---------- категории ---------- */
  function renderCats() {
    var counts = {}; D.items.forEach(function (it) { counts[it.cat] = (counts[it.cat] || 0) + 1; });
    var list = [{ id: 'all', name: 'Все', icon: 'all' }].concat((D.cats || []).filter(function (c) { return counts[c.id]; }));
    $('#cats').innerHTML = list.map(function (c) {
      var n = c.id === 'all' ? D.items.length : counts[c.id];
      return '<button class="cat' + (cat === c.id ? ' on' : '') + '" data-cat="' + esc(c.id) + '"><span class="ci">' + MF.icon(c.icon) + '</span>' + esc(c.name) + ' <small>' + n + '</small></button>';
    }).join('');
  }
  $('#cats').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]'); if (!b) return;
    cat = b.getAttribute('data-cat'); renderCats(); renderGrid();
    b = $('[data-cat="' + cat + '"]'); if (b && b.scrollIntoView) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    var top = $('#catalog').getBoundingClientRect().top + scrollY - 40;
    if (scrollY > top + 200) scrollTo({ top: top, behavior: 'smooth' });
  });

  /* ---------- акции ---------- */
  function renderPromos() {
    var list = (D.promos || []).filter(MF.promoLive);
    $('#promos').innerHTML = list.map(function (p, i) {
      return '<div class="promo' + (p.image ? '' : ' noimg') + (i % 2 ? ' dark' : '') + '"><div>' +
        (+p.percent > 0 ? '<span class="pct">−' + (+p.percent) + '%</span>' : '') +
        '<b>' + esc(p.title) + '</b>' + (p.text ? '<p>' + esc(p.text) + '</p>' : '') + '</div>' +
        (p.image ? '<img src="' + esc(MF.src(p.image)) + '" alt="" loading="lazy">' : '') + '</div>';
    }).join('');
  }

  /* ---------- сетка товаров ---------- */
  function sizeLine(it) {
    var s = it.sizes || [];
    if (!s.length) return '';
    var have = s.filter(function (x) { return +x.q > 0; }).map(function (x) { return x.s; });
    return have.length ? 'Размеры: ' + have.join(' · ') : '';
  }
  function cardHTML(it, i) {
    var p = MF.pricing(it, D.promos), out = !MF.inStock(it);
    var tags = (it.tags || []).slice(0, 2).map(function (t) { return '<span class="badge ' + t + '">' + esc(MF.TAGS[t] || t) + '</span>'; });
    if (p.off) tags.unshift('<span class="badge sale">−' + p.off + '%</span>');
    var ph = (it.photos || [])[0];
    return '<article class="card" style="animation-delay:' + Math.min(i, 12) * 40 + 'ms">' +
      '<a class="card-img" href="#p/' + esc(it.id) + '" data-open="' + esc(it.id) + '"' + ((it.videos || []).length ? ' data-vid="' + esc(MF.src(it.videos[0])) + '"' : '') + '>' +
        (ph ? '<img src="' + esc(MF.src(ph)) + '" alt="' + esc(it.name) + '" loading="lazy">' : '') +
        '<div class="badges">' + tags.join('') + '</div>' +
        ((it.videos || []).length ? '<span class="vid-badge" title="Есть видео"><svg viewBox="0 0 10 12"><path d="M0 0l10 6-10 6z"/></svg></span>' : '') +
        (out ? '<span class="card-out">Нет в наличии</span>' : '') +
      '</a>' +
      (out ? '' : '<button class="card-add" data-open="' + esc(it.id) + '" aria-label="Выбрать размер">+</button>') +
      '<div class="card-b"><a href="#p/' + esc(it.id) + '" data-open="' + esc(it.id) + '" class="card-name">' + esc(it.name) + '</a>' +
      '<div class="card-price"><b>' + money(p.price) + '</b>' + (p.old ? '<s>' + money(p.old) + '</s>' : '') + '</div>' +
      '<div class="card-sz">' + esc(sizeLine(it)) + '</div></div></article>';
  }
  function filtered() {
    var nq = MF.norm(q).trim();
    var list = D.items.filter(function (it) {
      if (cat !== 'all' && it.cat !== cat) return false;
      if (nq) { var c = catById(it.cat); if (MF.norm([it.name, it.color, it.desc, c && c.name].join(' ')).indexOf(nq) < 0) return false; }
      return true;
    });
    if (sort) list = list.slice().sort(function (a, b) { var d = MF.pricing(a, D.promos).price - MF.pricing(b, D.promos).price; return sort === 'cheap' ? d : -d; });
    // товары в наличии — выше
    return list.slice().sort(function (a, b) { return (MF.inStock(b) ? 1 : 0) - (MF.inStock(a) ? 1 : 0); });
  }
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c); }
  function renderGrid() {
    var list = filtered();
    var c = catById(cat);
    $('#catSub').textContent = q ? 'Поиск: «' + q + '»' : (c ? c.name : 'Вся коллекция — выберите категорию');
    $('#count').textContent = plural(list.length, 'товар', 'товара', 'товаров');
    $('#grid').innerHTML = list.length ? list.map(cardHTML).join('') :
      '<div class="empty">Ничего не нашли. Попробуйте другую категорию или напишите нам — подберём!</div>';
    bindHoverVideo();
  }
  $('#sort').addEventListener('change', function (e) { sort = e.target.value; renderGrid(); });

  /* видео в карточке при наведении (на компьютере) */
  function bindHoverVideo() {
    if (!matchMedia('(hover: hover)').matches) return;
    $$('#grid [data-vid]').forEach(function (a) {
      var v;
      a.addEventListener('mouseenter', function () {
        if (!v) { v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.src = a.getAttribute('data-vid'); a.insertBefore(v, a.children[1]); }
        v.play().then(function () { v.classList.add('on'); }).catch(function () {});
      });
      a.addEventListener('mouseleave', function () { if (v) { v.pause(); v.classList.remove('on'); } });
    });
  }

  /* ---------- поиск ---------- */
  $('#searchBtn').addEventListener('click', function () {
    var s = $('#search'); s.hidden = !s.hidden; hdrState();
    if (!s.hidden) { $('#q').focus(); }
  });
  $('#searchX').addEventListener('click', function () { $('#search').hidden = true; q = ''; $('#q').value = ''; renderGrid(); });
  var qt;
  $('#q').addEventListener('input', function (e) {
    clearTimeout(qt); qt = setTimeout(function () {
      q = e.target.value.trim(); cat = 'all'; renderCats(); renderGrid();
      if (q) { var top = $('#catalog').getBoundingClientRect().top + scrollY - 20; scrollTo({ top: top, behavior: 'smooth' }); }
    }, 250);
  });

  /* ---------- видео-лента ---------- */
  function renderReels() {
    var list = D.items.filter(function (it) { return (it.videos || []).length; });
    if (!list.length) { $('#videos').hidden = true; return; }
    $('#reels').innerHTML = list.map(function (it) {
      var p = MF.pricing(it, D.promos);
      return '<button class="reel" data-open="' + esc(it.id) + '">' +
        '<video muted loop playsinline preload="none" poster="' + esc(MF.src((it.photos || [])[0])) + '" data-src="' + esc(MF.src(it.videos[0])) + '"></video>' +
        '<span class="reel-play"><svg viewBox="0 0 10 12"><path d="M0 0l10 6-10 6z"/></svg></span>' +
        '<div class="reel-cap"><b>' + esc(it.name) + '</b><span>' + money(p.price) + '</span></div></button>';
    }).join('');
    // видео играют, только когда видны на экране
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          var v = en.target;
          if (en.isIntersecting) { if (!v.src) v.src = v.getAttribute('data-src'); v.play().catch(function () {}); }
          else v.pause();
        });
      }, { threshold: 0.6 });
      $$('#reels video').forEach(function (v) { io.observe(v); });
    } else $$('#reels video').forEach(function (v) { v.src = v.getAttribute('data-src'); v.autoplay = true; });
  }

  /* ---------- карточка товара ---------- */
  var cur = null, curSize = '', curQty = 1, lastFocus = null;
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]');
    if (o) { e.preventDefault(); openItem(o.getAttribute('data-open')); }
  });
  function openItem(id, noHash) {
    var it = itemById(id); if (!it) return;
    cur = it; curQty = 1;
    var avail = (it.sizes || []).filter(function (s) { return +s.q > 0; });
    curSize = (it.sizes || []).length === 1 && avail.length === 1 ? avail[0].s : '';
    var p = MF.pricing(it, D.promos);
    var media = (it.videos || []).map(function (v) { return { v: v }; }).concat((it.photos || []).map(function (ph) { return { p: ph }; }));
    // фото — первым, видео — вторым слайдом: так карточка открывается мгновенно
    if (media.length > 1 && media[0].v) { var first = media.splice((it.videos || []).length, 1)[0]; media.unshift(first); }
    $('#pmGal').innerHTML = media.map(function (m, i) {
      return '<div>' + (m.v ?
        '<video src="' + esc(MF.src(m.v)) + '" muted loop playsinline preload="metadata" poster="' + esc(MF.src((it.photos || [])[0])) + '"></video><span class="vlabel">▶ Видео</span><button class="vmute" data-mute aria-label="Звук">🔇</button>' :
        '<img src="' + esc(MF.src(m.p)) + '" alt="' + esc(it.name) + ' — фото ' + (i + 1) + '"' + (i ? ' loading="lazy"' : '') + '>') + '</div>';
    }).join('');
    $('#pmDots').innerHTML = media.length > 1 ? media.map(function (m, i) { return '<i class="' + (i ? '' : 'on') + (m.v ? ' v' : '') + '"></i>'; }).join('') : '';
    $('#pmPrev').hidden = $('#pmNext').hidden = media.length < 2;
    $('#pmGal').scrollLeft = 0;
    var c = catById(it.cat);
    $('#pmTags').innerHTML = (c ? '<span class="badge">' + esc(c.name) + '</span>' : '') + (it.tags || []).map(function (t) { return '<span class="badge ' + t + '">' + esc(MF.TAGS[t] || t) + '</span>'; }).join('');
    $('#pmName').textContent = it.name;
    $('#pmColor').textContent = it.color ? 'Цвет: ' + it.color : '';
    $('#pmPrice').innerHTML = '<b>' + money(p.price) + '</b>' + (p.old ? '<s>' + money(p.old) + '</s><span class="off">−' + p.off + '%</span>' : '');
    $('#pmDesc').innerHTML = MF.nl2br(it.desc || '');
    $('#pmAsk').href = MF.wa(S().whatsapp, 'Здравствуйте! Вопрос по товару «' + it.name + '» с сайта.');
    renderSizes(); updQty();
    lastFocus = document.activeElement;
    $('#pm').hidden = false; document.body.classList.add('lock');
    $('.modal-box', $('#pm')).scrollTop = 0;
    if (!noHash) history.replaceState(null, '', '#p/' + it.id);
    setTimeout(function () { $('.modal-x', $('#pm')).focus({ preventScroll: true }); }, 50);
  }
  function renderSizes() {
    var it = cur, s = it.sizes || [];
    $('.pm-sizes-h').hidden = !s.length;
    $('#pmSizes').innerHTML = s.map(function (x) {
      var out = !(+x.q > 0);
      return '<button class="sz' + (x.s === curSize ? ' on' : '') + (out ? ' out' : '') + '" data-sz="' + esc(x.s) + '"' + (out ? ' aria-disabled="true" title="Нет в наличии"' : '') + '>' + esc(x.s) + (!out && +x.q === 1 ? '<small>1</small>' : '') + '</button>';
    }).join('');
    var any = MF.inStock(it);
    $('#pmSizeHint').textContent = !any ? 'Нет в наличии' : s.some(function (x) { return +x.q === 1; }) ? '«1» — последняя вещь' : '';
    $('#pmAdd').disabled = !any;
    $('#pmAdd').textContent = !any ? 'Нет в наличии' : (s.length && !curSize ? 'Выберите размер' : 'В корзину · ' + money(MF.pricing(it, D.promos).price * curQty));
  }
  $('#pmSizes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sz]'); if (!b || b.classList.contains('out')) return;
    curSize = b.getAttribute('data-sz'); curQty = Math.min(curQty, maxQty()); renderSizes(); updQty();
  });
  function maxQty() { var s = (cur.sizes || []).filter(function (x) { return x.s === curSize; })[0]; return s ? Math.max(1, Math.min(10, +s.q)) : 10; }
  function updQty() { $('#pmQty').textContent = curQty; renderSizesBtn(); }
  function renderSizesBtn() { if (MF.inStock(cur) && (!(cur.sizes || []).length || curSize)) $('#pmAdd').textContent = 'В корзину · ' + money(MF.pricing(cur, D.promos).price * curQty); }
  $('#pmMinus').addEventListener('click', function () { if (curQty > 1) { curQty--; updQty(); } });
  $('#pmPlus').addEventListener('click', function () { if (curQty < maxQty()) { curQty++; updQty(); } else toast('Больше нет в наличии'); });
  $('#pmAdd').addEventListener('click', function () {
    if ((cur.sizes || []).length && !curSize) { var z = $('#pmSizes'); z.classList.remove('shake'); void z.offsetWidth; z.classList.add('shake'); toast('Выберите размер'); return; }
    addToCart(cur.id, curSize, curQty);
    closeModal('#pm');
    toast('Добавлено в корзину ♥');
  });

  // листалка галереи
  var galT;
  $('#pmGal').addEventListener('scroll', function () {
    clearTimeout(galT); galT = setTimeout(function () {
      var g = $('#pmGal'), i = Math.round(g.scrollLeft / g.clientWidth);
      $$('#pmDots i').forEach(function (d, n) { d.classList.toggle('on', n === i); });
      $$('#pmGal video').forEach(function (v) {
        var slide = v.parentNode, idx = Array.prototype.indexOf.call(g.children, slide);
        if (idx === i) v.play().catch(function () {}); else v.pause();
      });
    }, 60);
  }, { passive: true });
  function galGo(d) { var g = $('#pmGal'); g.scrollTo({ left: g.scrollLeft + d * g.clientWidth, behavior: 'smooth' }); }
  $('#pmPrev').addEventListener('click', function () { galGo(-1); });
  $('#pmNext').addEventListener('click', function () { galGo(1); });
  $('#pmGal').addEventListener('click', function (e) {
    var m = e.target.closest('[data-mute]');
    if (m) { var v = m.parentNode.querySelector('video'); v.muted = !v.muted; m.textContent = v.muted ? '🔇' : '🔊'; if (v.paused) v.play().catch(function () {}); return; }
    var v2 = e.target.closest('video'); if (v2) { v2.paused ? v2.play().catch(function () {}) : v2.pause(); }
  });

  /* ---------- открытие и закрытие окон ---------- */
  function closeModal(sel) {
    var m = $(sel); if (m.hidden) return;
    m.hidden = true;
    $$('video', m).forEach(function (v) { v.pause(); });
    if ($('#pm').hidden && $('#cart').hidden) document.body.classList.remove('lock');
    if (sel === '#pm' && /^#p\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (sel === '#cart') syncCart();
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeModal('#' + b.closest('.modal, .drawer').id); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!$('#pm').hidden) closeModal('#pm'); else closeModal('#cart'); } });
  function openFromHash() { var m = /^#p\/(.+)$/.exec(location.hash); if (m) openItem(decodeURIComponent(m[1]), true); }
  window.addEventListener('hashchange', openFromHash);

  /* ---------- корзина ---------- */
  function saveCart() { store(CART_KEY, JSON.stringify(cart)); syncCart(); }
  function cartLines() {
    return cart.map(function (c) {
      var it = itemById(c.id); if (!it) return null;
      var sz = (it.sizes || []).filter(function (x) { return x.s === c.size; })[0];
      var ok = !(it.sizes || []).length || (sz && +sz.q > 0);
      return { c: c, it: it, price: MF.pricing(it, D.promos).price, ok: ok, max: sz ? Math.min(10, +sz.q) : 10 };
    }).filter(Boolean);
  }
  function cartTotal() { return cartLines().reduce(function (s, l) { return s + (l.ok ? l.price * l.c.qty : 0); }, 0); }
  function cartCount() { return cartLines().reduce(function (s, l) { return s + l.c.qty; }, 0); }
  function addToCart(id, size, qty) {
    var ex = cart.filter(function (c) { return c.id === id && c.size === size; })[0];
    if (ex) ex.qty = Math.min(10, ex.qty + qty); else cart.push({ id: id, size: size, qty: qty });
    saveCart();
    var b = $('#cartCount'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  }
  function syncCart() {
    if (!D) return;
    cart = cart.filter(function (c) { return itemById(c.id); });
    var n = cartCount();
    $('#cartCount').hidden = !n; $('#cartCount').textContent = n;
    $('#cartBar').hidden = !n || !$('#cart').hidden;
    $('#cartBarN').textContent = n; $('#cartBarSum').textContent = money(cartTotal());
    if (!$('#cart').hidden && step === 'cart') renderCart();
  }

  var step = 'cart';
  function openCart() { step = 'cart'; lastFocus = document.activeElement; $('#cart').hidden = false; $('#cartBar').hidden = true; document.body.classList.add('lock'); renderCart(); }
  $('#cartBtn').addEventListener('click', openCart);
  $('#cartBar').addEventListener('click', openCart);

  function renderCart() {
    step = 'cart';
    $('#cartTitle').textContent = 'Корзина'; $('#cartBack').hidden = true;
    var lines = cartLines();
    if (!lines.length) {
      $('#cartBody').innerHTML = '<div class="cart-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke-linecap="round"/></svg><b>Корзина пока пуста</b>Загляните в каталог — там много красивого</div>';
      $('#cartFoot').innerHTML = '<button class="btn btn-dark" data-go-catalog>Перейти в каталог</button>';
      return;
    }
    $('#cartBody').innerHTML = lines.map(function (l, i) {
      return '<div class="ci-row"><a href="#p/' + esc(l.it.id) + '" data-open="' + esc(l.it.id) + '"><img src="' + esc(MF.src((l.it.photos || [])[0])) + '" alt=""></a><div>' +
        '<div class="ci-name">' + esc(l.it.name) + '</div>' +
        '<div class="ci-meta">' + (l.c.size ? 'Размер: ' + esc(l.c.size) : '') + (l.it.color ? (l.c.size ? ' · ' : '') + esc(l.it.color) : '') + '</div>' +
        (l.ok ? '<div class="ci-bot"><div class="qty sm"><button data-q="' + i + '" data-d="-1" aria-label="Меньше">−</button><span>' + l.c.qty + '</span><button data-q="' + i + '" data-d="1" aria-label="Больше">+</button></div><b>' + money(l.price * l.c.qty) + '</b></div>'
          : '<div class="ci-meta" style="color:#D92D20;font-weight:700">Этот размер закончился</div>') +
        '<button class="ci-del" data-del="' + i + '">Удалить</button></div></div>';
    }).join('');
    var total = cartTotal();
    var hint = total >= 30000 ? '🎉 Доставка Казпочтой по Казахстану — бесплатно' : 'До бесплатной доставки Казпочтой осталось ' + money(30000 - total);
    $('#cartFoot').innerHTML = '<div class="sum-row total"><span>Итого</span><span>' + money(total) + '</span></div>' +
      '<div class="free-hint">🚚 По Караганде и Михайловке доставка бесплатно. ' + hint + '</div>' +
      '<button class="btn btn-dark" id="toCheckout" style="margin-top:10px"' + (lines.some(function (l) { return l.ok; }) ? '' : ' disabled') + '>Оформить заказ</button>';
  }
  $('#cartBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]');
    if (b) {
      var lines = cartLines(), l = lines[+b.getAttribute('data-q')], d = +b.getAttribute('data-d');
      if (!l) return;
      var n = l.c.qty + d;
      if (n < 1) return;
      if (n > l.max) { toast('Больше нет в наличии'); return; }
      l.c.qty = n; saveCart(); renderCart(); return;
    }
    var del = e.target.closest('[data-del]');
    if (del) { var l2 = cartLines()[+del.getAttribute('data-del')]; cart = cart.filter(function (c) { return c !== l2.c; }); saveCart(); renderCart(); return; }
    if (e.target.closest('[data-open]')) closeModal('#cart');
  });
  $('#cartFoot').addEventListener('click', function (e) {
    if (e.target.closest('#toCheckout')) renderCheckout();
    if (e.target.closest('[data-go-catalog]')) { closeModal('#cart'); syncCart(); location.hash = 'catalog'; }
  });
  $('#cartBack').addEventListener('click', renderCart);

  /* ---------- анкета заказа ---------- */
  function savedForm() { try { return JSON.parse(store(FORM_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function renderCheckout() {
    step = 'form';
    $('#cartTitle').textContent = 'Оформление'; $('#cartBack').hidden = false;
    var f = savedForm(), lines = cartLines().filter(function (l) { return l.ok; });
    var dlv = f.delivery || 'city';
    $('#cartBody').innerHTML = '<form class="form" id="orderForm" novalidate>' +
      fld('name', 'Ваше имя', '<input class="inp" name="name" autocomplete="given-name" placeholder="Например, Анна" value="' + esc(f.name || '') + '" required>') +
      fld('city', 'Город', '<input class="inp" name="city" autocomplete="address-level2" list="cityList" placeholder="Караганда" value="' + esc(f.city || 'Караганда') + '" required><datalist id="cityList"><option value="Караганда"><option value="Михайловка"><option value="Темиртау"><option value="Астана"><option value="Алматы"><option value="Шахтинск"><option value="Сарань"></datalist>') +
      fld('phone', 'Номер телефона для связи', '<input class="inp" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 7__ ___ __ __" value="' + esc(f.phone || '') + '" required>') +
      '<label class="chk"><input type="checkbox" id="same"' + (f.same !== false ? ' checked' : '') + '> Счёт Kaspi выставить на этот же номер</label>' +
      '<div id="kaspiWrap"' + (f.same !== false ? ' hidden' : '') + '>' + fld('kaspi', 'Номер для счёта Kaspi', '<input class="inp" name="kaspi" type="tel" inputmode="tel" placeholder="+7 7__ ___ __ __" value="' + esc(f.kaspi || '') + '"><small>На этот номер придёт удалённый счёт в приложении Kaspi.kz</small>') + '</div>' +
      '<div class="fld"><span>Как получить заказ</span><div class="opts">' +
        opt('city', 'Доставка по Караганде / Михайловке', 'Бесплатно, пн–пт. С примеркой — 1 000 ₸', dlv) +
        opt('post', 'Казпочта по Казахстану', cartTotal() >= 30000 ? 'Бесплатно для вашего заказа' : 'Бесплатно от 30 000 ₸', dlv) +
        opt('pickup', 'Самовывоз', esc((S().address || '') + ', ' + (S().hours || '')), dlv) +
      '</div></div>' +
      '<div id="addrWrap"' + (dlv === 'pickup' ? ' hidden' : '') + '>' + fld('address', 'Адрес доставки', '<input class="inp" name="address" autocomplete="street-address" placeholder="Улица, дом, квартира" value="' + esc(f.address || '') + '">') + '</div>' +
      fld('comment', 'Комментарий', '<textarea class="inp" name="comment" placeholder="Например: нужна доставка с примеркой, удобное время">' + '</textarea>', true) +
      '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="form-sum">' + lines.map(function (l) { return '<div><span>' + esc(l.it.name) + (l.c.size ? ', ' + esc(l.c.size) : '') + ' × ' + l.c.qty + '</span><b>' + money(l.price * l.c.qty) + '</b></div>'; }).join('') + '</div>' +
      '</form>';
    $('#cartFoot').innerHTML = '<div class="sum-row total"><span>К оплате</span><span>' + money(cartTotal()) + '</span></div>' +
      '<button class="btn btn-pink" id="sendOrder">Отправить заказ</button>' +
      '<p class="legal">Оплата — после подтверждения: мы выставим счёт на ваш номер Kaspi</p>';
    $('#cartBody').scrollTop = 0;
  }
  function fld(name, label, input, optional) { return '<label class="fld" data-f="' + name + '"><span>' + label + (optional ? '' : ' <i>*</i>') + '</span>' + input + '</label>'; }
  function opt(v, t, d, cur) { return '<label class="opt"><input type="radio" name="delivery" value="' + v + '"' + (cur === v ? ' checked' : '') + '><div><b>' + t + '</b><span>' + d + '</span></div></label>'; }
  $('#cartBody').addEventListener('change', function (e) {
    if (e.target.id === 'same') $('#kaspiWrap').hidden = e.target.checked;
    if (e.target.name === 'delivery') $('#addrWrap').hidden = e.target.value === 'pickup';
  });
  $('#cartBody').addEventListener('input', function (e) {
    if (e.target.type === 'tel') e.target.value = maskPhone(e.target.value);
    var f = e.target.closest('.fld'); if (f) { e.target.classList.remove('err'); var er = $('.errt', f); if (er) er.remove(); }
  });
  function maskPhone(v) {
    var d = MF.digits(v); if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1); if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var o = '+7'; if (d.length > 1) o += ' ' + d.slice(1, 4); if (d.length > 4) o += ' ' + d.slice(4, 7); if (d.length > 7) o += ' ' + d.slice(7, 9); if (d.length > 9) o += ' ' + d.slice(9, 11);
    return o;
  }
  function fieldErr(name, msg) {
    var f = $('[data-f="' + name + '"]'); if (!f) return;
    var inp = $('.inp', f); inp.classList.add('err');
    if (!$('.errt', f)) f.insertAdjacentHTML('beforeend', '<span class="errt">' + esc(msg) + '</span>');
  }
  $('#cartFoot').addEventListener('click', function (e) { if (e.target.closest('#sendOrder')) sendOrder(); });

  function sendOrder() {
    var form = $('#orderForm'); if (!form) return;
    var v = function (n) { return (form.elements[n] && form.elements[n].value || '').trim(); };
    var same = $('#same').checked;
    var data = {
      name: v('name'), city: v('city'), phone: v('phone'), kaspi: same ? v('phone') : v('kaspi'),
      delivery: (form.querySelector('[name=delivery]:checked') || {}).value || 'city', address: v('address'), comment: v('comment'), website: v('website'),
      items: cartLines().filter(function (l) { return l.ok; }).map(function (l) { return { id: l.it.id, size: l.c.size, qty: l.c.qty }; })
    };
    var bad = false;
    if (data.name.length < 2) { fieldErr('name', 'Укажите имя'); bad = true; }
    if (data.city.length < 2) { fieldErr('city', 'Укажите город'); bad = true; }
    if (MF.digits(data.phone).length !== 11) { fieldErr('phone', 'Введите номер полностью: +7 7XX XXX XX XX'); bad = true; }
    if (!same && MF.digits(data.kaspi).length !== 11) { fieldErr('kaspi', 'Введите номер Kaspi полностью'); bad = true; }
    if (data.delivery !== 'pickup' && data.address.length < 3) { fieldErr('address', 'Укажите адрес доставки'); bad = true; }
    if (bad) { var er = $('.inp.err'); if (er) { er.focus(); er.scrollIntoView({ block: 'center', behavior: 'smooth' }); } return; }
    store(FORM_KEY, JSON.stringify({ name: data.name, city: data.city, phone: data.phone, kaspi: same ? '' : data.kaspi, same: same, delivery: data.delivery, address: data.address }));

    var btn = $('#sendOrder'); btn.disabled = true; btn.textContent = 'Отправляем…';
    var total = cartTotal(), lines = cartLines().filter(function (l) { return l.ok; });
    fetch(MF.API + '/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Ошибка ' + r.status); e.server = true; throw e; } return j; }); })
      .then(function (j) { orderDone(j.number, j.total || total, data, lines); })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = 'Отправить заказ';
        if (e.server) { toast(e.message, 'err'); return; }
        // нет связи с сервером — отправляем заказ в WhatsApp
        orderDone(0, total, data, lines);
      });
  }
  function orderText(num, total, d, lines) {
    return 'Здравствуйте! ' + (num ? 'Мой заказ №' + num + ' с сайта' : 'Хочу оформить заказ с сайта') + ':\n' +
      lines.map(function (l) { return '• ' + l.it.name + (l.c.size ? ', размер ' + l.c.size : '') + ' × ' + l.c.qty + ' — ' + money(l.price * l.c.qty); }).join('\n') +
      '\nИтого: ' + money(total) + '\n\nИмя: ' + d.name + '\nГород: ' + d.city + '\nТелефон: ' + d.phone + '\nСчёт Kaspi на номер: ' + d.kaspi +
      '\nПолучение: ' + MF.DELIVERY[d.delivery] + (d.address && d.delivery !== 'pickup' ? ', ' + d.address : '') + (d.comment ? '\nКомментарий: ' + d.comment : '');
  }
  function orderDone(num, total, d, lines) {
    var text = orderText(num, total, d, lines);
    cart = []; saveCart();
    step = 'done';
    $('#cartTitle').textContent = num ? 'Заказ принят' : 'Почти готово'; $('#cartBack').hidden = true;
    $('#cartBody').innerHTML = '<div class="done">' + MF.ears('done-ears') +
      '<h4>' + (num ? 'Спасибо, ' + esc(d.name) + '!' : 'Отправьте заказ в WhatsApp') + '</h4>' +
      (num ? '<span class="num">Заказ № ' + num + '</span>' : '') +
      '<p>' + (num ? 'Мы получили заказ на ' + money(total) + '. В течение рабочего дня перезвоним на ' + esc(MF.phoneFmt(d.phone)) + ', уточним детали и выставим счёт в Kaspi на номер ' + esc(MF.phoneFmt(d.kaspi)) + '.'
        : 'Не получилось связаться с сервером. Нажмите кнопку ниже — заказ уже написан, останется только отправить сообщение.') + '</p>' +
      '<a class="btn ' + (num ? 'btn-ghost' : 'btn-pink') + '" target="_blank" rel="noopener" href="' + esc(MF.wa(S().whatsapp, text)) + '">' + (num ? 'Написать нам в WhatsApp' : 'Отправить в WhatsApp') + '</a>' +
      '<button class="btn btn-dark" data-close-done>Продолжить покупки</button></div>';
    $('#cartFoot').innerHTML = '';
  }
  $('#cartBody').addEventListener('click', function (e) { if (e.target.closest('[data-close-done]')) { closeModal('#cart'); syncCart(); } });

  /* ---------- шапка ---------- */
  function hdrState() {
    var h = $('#hero'); if (!h) return;
    $('#hdr').classList.toggle('over', $('#search').hidden && h.getBoundingClientRect().bottom > $('#hdr').offsetHeight + 10);
  }
  window.addEventListener('scroll', hdrState, { passive: true });
  window.addEventListener('resize', hdrState);
  hdrState();

  /* ---------- главный экран: смена фото ---------- */
  var HERO_ITEMS = ['fur-cloud-grey', 'puff-ice', 'sw-graphite'];
  var hi = 0, heroT;
  function heroGo(n) {
    var figs = $$('#heroPics figure'), dots = $$('#heroDots button');
    hi = (n + figs.length) % figs.length;
    figs.forEach(function (f, i) { f.classList.toggle('on', i === hi); });
    dots.forEach(function (d, i) { d.classList.remove('on'); if (i === hi) { void d.offsetWidth; d.classList.add('on'); } });
    clearTimeout(heroT); heroT = setTimeout(function () { heroGo(hi + 1); }, 5000);
  }
  if (!matchMedia('(min-width: 900px)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) heroT = setTimeout(function () { heroGo(1); }, 5000);
  $('#heroDots').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) heroGo($$('#heroDots button').indexOf(b)); });
  $$('#heroPics figcaption').forEach(function (c, i) { c.addEventListener('click', function () { if (D) openItem(HERO_ITEMS[i]); }); });
  /* свайп по главному фото */
  var tx = null;
  $('#hero').addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  $('#hero').addEventListener('touchend', function (e) { if (tx == null) return; var d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) heroGo(hi + (d < 0 ? 1 : -1)); tx = null; }, { passive: true });
})();
