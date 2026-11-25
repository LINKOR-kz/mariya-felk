/* Mariya Felk — админ-панель */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = MF.esc, money = MF.money, API = MF.API;
  var TOKEN_KEY = 'mf-admin-token';
  var token = store(TOKEN_KEY) || '';
  var D = null, ver = 0, ORDERS = [], orderF = 'active', openOrder = null, itemCat = 'all', itemQ = '';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- связь с сервером ---------- */
  function call(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && path !== '/login') { logout(); throw new Error('Сессия закончилась — войдите снова'); }
        if (!r.ok) throw new Error(j.error || ('Ошибка ' + r.status));
        return j;
      });
    }, function () { throw new Error('Нет связи с сервером. Проверьте интернет.'); });
  }
  function normalize(d) {
    d = d || {};
    d.settings = d.settings || {}; d.cats = d.cats || []; d.items = d.items || []; d.promos = d.promos || [];
    d.settings.delivery = d.settings.delivery || [];
    d.items.forEach(function (it) { it.photos = it.photos || []; it.videos = it.videos || []; it.sizes = it.sizes || []; it.tags = it.tags || []; it.status = it.status || 'active'; });
    return d;
  }
  function loadData() {
    busy('Загружаем каталог…');
    return call('/admin/data').then(function (r) {
      ver = r.version || 0;
      if (r.data) return r.data;
      return fetch('data/catalog.json?t=' + Date.now()).then(function (x) { return x.json(); });
    }).then(function (d) { D = normalize(d); unbusy(); renderAll(); })
      .catch(function (e) { unbusy(); toast(e.message, 'err'); });
  }
  /* Любое изменение: меняем копию, сохраняем на сервер, при успехе — применяем */
  function commit(fn, okMsg) {
    var next = clone(D); fn(next);
    busy('Сохраняем…');
    return call('/admin/save', { method: 'POST', body: JSON.stringify({ data: next, version: ver }) }).then(function (r) {
      ver = r.version; D = normalize(next); unbusy(); renderAll(); toast(okMsg || 'Сохранено', 'ok'); return true;
    }).catch(function (e) { unbusy(); toast(e.message, 'err'); return false; });
  }

  /* ---------- вход ---------- */
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#loginLogo').innerHTML = MF.logo(); setTimeout(function () { $('#pwd').focus(); }, 50); }
  function logout() { token = ''; store(TOKEN_KEY, null); closeSheet(true); showLogin(); }
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('button', e.target); b.disabled = true; b.textContent = 'Входим…'; $('#loginErr').textContent = '';
    call('/login', { method: 'POST', body: JSON.stringify({ password: $('#pwd').value }) }).then(function (r) {
      token = r.token; store(TOKEN_KEY, token); $('#pwd').value = ''; start();
    }).catch(function (err) { $('#loginErr').textContent = err.message; })
      .then(function () { b.disabled = false; b.textContent = 'Войти'; });
  });
  $('#logout').addEventListener('click', function () { if (confirm('Выйти из админки?')) logout(); });
  function start() { $('#login').hidden = true; $('#app').hidden = false; $('#topLogo').innerHTML = MF.logo(true); loadData().then(loadOrders); }
  if (token) start(); else showLogin();

  /* ---------- уведомления ---------- */
  var tt;
  function toast(msg, kind) { var t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + (kind || ''); clearTimeout(tt); tt = setTimeout(function () { t.className = 'toast'; }, kind === 'err' ? 5000 : 2400); }
  function busy(msg, p) { $('#busy').hidden = false; $('#busyText').textContent = msg; $('#busyBar').parentNode.hidden = p == null; $('#busyBar').style.width = Math.round((p || 0) * 100) + '%'; }
  function unbusy() { $('#busy').hidden = true; }

  /* ---------- вкладки ---------- */
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    var tab = b.getAttribute('data-tab');
    $$('#tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
    $$('.pane').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== tab; });
    if (tab === 'orders') loadOrders();
    scrollTo(0, 0);
  });
  function renderAll() { if (!D) return; renderItems(); renderCats(); renderPromos(); renderSettings(); }
  function catName(id) { var c = D.cats.filter(function (x) { return x.id === id; })[0]; return c ? c.name : 'Без категории'; }
  function itemById(id) { return D.items.filter(function (x) { return x.id === id; })[0]; }

  /* ================= ЗАКАЗЫ ================= */
  function loadOrders() {
    return call('/admin/orders').then(function (r) { ORDERS = r.orders || []; renderOrders(); })
      .catch(function (e) { $('#orders').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }
  $('#ordersReload').addEventListener('click', function () { loadOrders().then(function () { toast('Заказы обновлены'); }); });
  setInterval(function () { if (token && !document.hidden) loadOrders(); }, 60000);

  function fmtDate(ts) { var d = new Date(ts); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
  function renderOrders() {
    var counts = { active: 0, all: ORDERS.length };
    ORDERS.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; if (['done', 'cancelled'].indexOf(o.status) < 0) counts.active++; });
    var n = counts.new || 0;
    $('#newCount').hidden = !n; $('#newCount').textContent = n;
    $('#ordersSub').textContent = ORDERS.length ? 'Всего ' + ORDERS.length + (n ? ' · новых ' + n : '') : 'Заказы с сайта появятся здесь';
    var filters = [['active', 'В работе'], ['new', 'Новые'], ['confirmed', 'Подтверждены'], ['paid', 'Оплачены'], ['sent', 'Отправлены'], ['done', 'Выполнены'], ['cancelled', 'Отменены'], ['all', 'Все']];
    $('#orderFilter').innerHTML = filters.map(function (f) { return '<button class="chip' + (orderF === f[0] ? ' on' : '') + '" data-of="' + f[0] + '">' + f[1] + ' <small>' + (counts[f[0]] || 0) + '</small></button>'; }).join('');
    var list = ORDERS.filter(function (o) { return orderF === 'all' || (orderF === 'active' ? ['done', 'cancelled'].indexOf(o.status) < 0 : o.status === orderF); });
    if (!list.length) { $('#orders').innerHTML = '<div class="empty">' + MF.ears() .replace('class="ears"', 'class="ears" style="width:60px;fill:#F7D3DF;margin:0 auto 8px;display:block"') + (ORDERS.length ? 'В этом разделе заказов нет' : 'Пока заказов нет. Когда покупатель оформит заказ на сайте, он сразу появится здесь.') + '</div>'; return; }
    $('#orders').innerHTML = list.map(orderHTML).join('');
  }
  function orderHTML(o) {
    var st = MF.STATUSES[o.status] || MF.STATUSES.new, open = openOrder === o.key;
    var count = o.items.reduce(function (s, i) { return s + i.qty; }, 0);
    return '<div class="ord" data-ok="' + esc(o.key) + '"><div class="ord-h" data-toggle>' +
      '<div class="grow"><div class="ord-n">№ ' + o.number + ' <span class="st" style="background:' + st.color + '">' + st.name + '</span></div>' +
      '<div class="ord-who">' + esc(o.name) + ' · ' + esc(o.city) + ' · ' + count + ' шт.</div></div>' +
      '<div><div class="ord-sum">' + money(o.total) + '</div><div class="ord-date">' + fmtDate(o.at) + '</div></div></div>' +
      (open ? orderBody(o) : '') + '</div>';
  }
  function orderBody(o) {
    var msg = 'Здравствуйте, ' + o.name + '! Это магазин Mariya Felk. Ваш заказ №' + o.number + ' на ' + money(o.total) + ' принят. ';
    return '<div class="ord-b">' +
      '<div class="ord-grid">' +
        kv('Имя', esc(o.name)) + kv('Город', esc(o.city)) +
        kv('Телефон', '<a href="tel:+' + esc(o.phone) + '">' + esc(MF.phoneFmt(o.phone)) + '</a>') +
        kv('Счёт Kaspi на номер', '<span class="copy" data-copy="' + esc(o.kaspi) + '" title="Скопировать">' + esc(MF.phoneFmt(o.kaspi)) + '</span>') +
        kv('Получение', esc(MF.DELIVERY[o.delivery] || o.delivery)) +
        (o.address && o.delivery !== 'pickup' ? kv('Адрес', esc(o.address)) : '') +
        (o.comment ? kv('Комментарий', esc(o.comment)) : '') +
      '</div>' +
      '<div class="ord-items">' + o.items.map(function (i) {
        return '<div class="oi"><img src="' + esc(MF.src(i.photo)) + '" alt=""><div><b>' + esc(i.name) + '</b><small>' + (i.size ? 'Размер ' + esc(i.size) + ' · ' : '') + i.qty + ' шт. × ' + money(i.price) + '</small></div><b>' + money(i.price * i.qty) + '</b></div>';
      }).join('') + '<div class="kv" style="font-size:16px"><span>Итого</span><b>' + money(o.total) + '</b></div></div>' +
      '<div><div class="hint" style="margin-bottom:6px">Статус заказа</div><div class="st-pick">' + Object.keys(MF.STATUSES).map(function (k) {
        var s = MF.STATUSES[k]; return '<button data-st="' + k + '"' + (o.status === k ? ' class="on" style="background:' + s.color + '"' : '') + '>' + s.name + '</button>';
      }).join('') + '</div></div>' +
      '<label class="fld"><span>Заметка (видите только вы)</span><textarea class="inp" data-note rows="2" style="min-height:60px">' + esc(o.note || '') + '</textarea></label>' +
      '<div class="ord-act">' +
        '<a class="btn btn-pink" target="_blank" rel="noopener" href="' + esc(MF.wa(o.phone, msg)) + '">WhatsApp покупателю</a>' +
        '<a class="btn btn-light" href="tel:+' + esc(o.phone) + '">Позвонить</a>' +
        '<button class="btn btn-light" data-copy="' + esc(o.kaspi) + '">Скопировать номер Kaspi</button>' +
      '</div></div>';
  }
  function kv(k, v) { return '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; }
  $('#orderFilter').addEventListener('click', function (e) { var b = e.target.closest('[data-of]'); if (b) { orderF = b.getAttribute('data-of'); renderOrders(); } });
  $('#orders').addEventListener('click', function (e) {
    var card = e.target.closest('[data-ok]'); if (!card) return;
    var key = card.getAttribute('data-ok'), o = ORDERS.filter(function (x) { return x.key === key; })[0];
    var cp = e.target.closest('[data-copy]');
    if (cp) { var t = MF.digits(cp.getAttribute('data-copy')); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Номер скопирован: ' + t, 'ok'); }, function () { prompt('Скопируйте номер', t); }); return; }
    var sb = e.target.closest('[data-st]');
    if (sb) { updOrder(o, { status: sb.getAttribute('data-st') }, 'Статус: ' + MF.STATUSES[sb.getAttribute('data-st')].name); return; }
    if (e.target.closest('[data-toggle]')) { openOrder = openOrder === key ? null : key; renderOrders(); }
  });
  $('#orders').addEventListener('change', function (e) {
    if (!e.target.matches('[data-note]')) return;
    var key = e.target.closest('[data-ok]').getAttribute('data-ok'), o = ORDERS.filter(function (x) { return x.key === key; })[0];
    updOrder(o, { note: e.target.value }, 'Заметка сохранена');
  });
  function updOrder(o, patch, msg) {
    call('/admin/order/' + o.key, { method: 'POST', body: JSON.stringify(patch) }).then(function (r) {
      Object.assign(o, r.order); renderOrders(); toast(msg, 'ok');
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  /* ================= ТОВАРЫ ================= */
  function renderItems() {
    var counts = {}; D.items.forEach(function (it) { counts[it.cat] = (counts[it.cat] || 0) + 1; });
    $('#itemCats').innerHTML = ['<button class="chip' + (itemCat === 'all' ? ' on' : '') + '" data-icat="all">Все <small>' + D.items.length + '</small></button>']
      .concat(D.cats.map(function (c) { return '<button class="chip' + (itemCat === c.id ? ' on' : '') + '" data-icat="' + esc(c.id) + '">' + esc(c.name) + ' <small>' + (counts[c.id] || 0) + '</small></button>'; })).join('');
    var nq = MF.norm(itemQ);
    var list = D.items.filter(function (it) { return (itemCat === 'all' || it.cat === itemCat) && (!nq || MF.norm(it.name).indexOf(nq) >= 0); });
    var out = D.items.filter(function (it) { return !MF.inStock(it); }).length;
    $('#itemsSub').textContent = D.items.length + ' товаров · ' + D.items.filter(function (i) { return i.status !== 'hidden'; }).length + ' на сайте' + (out ? ' · ' + out + ' закончились' : '');
    if (!list.length) { $('#itemRows').innerHTML = '<div class="empty">Товаров нет. Нажмите «+ Добавить товар».</div>'; return; }
    $('#itemRows').innerHTML = list.map(function (it) {
      var p = MF.pricing(it, D.promos), sz = it.sizes || [];
      var have = sz.filter(function (s) { return +s.q > 0; });
      var szTxt = !sz.length ? 'Без размеров' : (have.length ? 'В наличии: ' + have.map(function (s) { return s.s + ' (' + s.q + ')'; }).join(', ') : '<span class="warn">Нет в наличии</span>');
      return '<div class="it' + (it.status === 'hidden' ? ' off' : '') + '"><div class="it-img">' + (it.photos[0] ? '<img src="' + esc(MF.src(it.photos[0])) + '" alt="" loading="lazy">' : '') + (it.videos.length ? '<span class="it-v">▶ ' + it.videos.length + '</span>' : '') + '</div>' +
        '<div><div class="it-name">' + esc(it.name) + '</div><div class="it-meta"><b>' + money(p.price) + '</b>' + (p.old ? ' <s>' + money(p.old) + '</s>' : '') + ' · ' + esc(catName(it.cat)) + '</div><div class="it-meta">' + szTxt + '</div></div>' +
        '<div class="it-act"><label class="sw" title="Показывать на сайте"><input type="checkbox" data-vis="' + esc(it.id) + '"' + (it.status !== 'hidden' ? ' checked' : '') + '><span></span></label>' +
        '<button class="mini" data-edit="' + esc(it.id) + '">Изменить</button></div></div>';
    }).join('');
  }
  $('#itemCats').addEventListener('click', function (e) { var b = e.target.closest('[data-icat]'); if (b) { itemCat = b.getAttribute('data-icat'); renderItems(); } });
  $('#itemQ').addEventListener('input', function (e) { itemQ = e.target.value; renderItems(); });
  $('#itemRows').addEventListener('click', function (e) { var b = e.target.closest('[data-edit]'); if (b) editItem(clone(itemById(b.getAttribute('data-edit'))), false); });
  $('#itemRows').addEventListener('change', function (e) {
    var id = e.target.getAttribute('data-vis'); if (!id) return;
    var on = e.target.checked;
    commit(function (d) { d.items.forEach(function (x) { if (x.id === id) x.status = on ? 'active' : 'hidden'; }); }, on ? 'Товар снова на сайте' : 'Товар скрыт с сайта');
  });
  $('#addItem').addEventListener('click', function () {
    editItem({ id: MF.uid('i'), name: '', cat: itemCat !== 'all' ? itemCat : (D.cats[0] || {}).id, price: '', oldPrice: '', color: '', desc: '', photos: [], videos: [], sizes: [], tags: ['new'], status: 'active' }, true);
  });

  /* ---------- окно редактирования ---------- */
  var SH = null;
  function openSheet(o) { SH = o; $('#sheetTitle').textContent = o.title; $('#sheet').hidden = false; document.body.classList.add('lock'); o.render(); $('.sheet-body').scrollTop = 0; }
  function closeSheet(force) {
    if (!SH) return;
    if (!force && SH.dirty && !confirm('Закрыть без сохранения?')) return;
    $$('#sheet video').forEach(function (v) { v.pause(); });
    SH = null; $('#sheet').hidden = true; document.body.classList.remove('lock');
  }
  $('#sheet').addEventListener('click', function (e) { if (e.target.closest('[data-sheet-close]')) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && SH) closeSheet(); });
  $('#sheetSave').addEventListener('click', function () { if (SH) SH.save(); });
  $('#sheetForm').addEventListener('input', function (e) {
    if (!SH || !SH.data) return;
    var k = e.target.getAttribute('data-k'); if (!k) return;
    SH.data[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; SH.dirty = true;
  });

  /* выбор и загрузка файлов */
  function pickFiles(accept, multiple) {
    return new Promise(function (res) {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = !!multiple;
      inp.onchange = function () { res(Array.prototype.slice.call(inp.files || [])); };
      inp.click();
    });
  }
  function uploadMany(files, kind) {
    var refs = [], i = 0;
    function next() {
      if (i >= files.length) { unbusy(); return refs; }
      var f = files[i], label = (kind === 'video' ? 'Загружаем видео ' : 'Загружаем фото ') + (files.length > 1 ? (i + 1) + ' из ' + files.length : '');
      busy(label, 0);
      if (kind === 'video' && f.size > 100 * 1024 * 1024) { toast('Видео больше 100 МБ — обрежьте или сожмите его', 'err'); i++; return next(); }
      var prep = kind === 'video' ? Promise.resolve(f) : MF.compressImage(f, 1600);
      return prep.then(function (blob) { return MF.uploadFile(blob, token, function (p) { busy(label, p); }); })
        .then(function (ref) { refs.push(ref); i++; return next(); });
    }
    return next().catch(function (e) { unbusy(); toast(e.message, 'err'); return refs; });
  }

  function editItem(d, isNew) {
    openSheet({
      title: isNew ? 'Новый товар' : 'Редактирование', data: d, dirty: false,
      render: function () { $('#sheetForm').innerHTML = itemForm(d, isNew); renderMedia(); renderSizesEd(); },
      save: function () {
        d.name = (d.name || '').trim(); d.price = Math.round(+String(d.price).replace(/\s/g, '')) || 0; d.oldPrice = Math.round(+String(d.oldPrice).replace(/\s/g, '')) || 0;
        if (!d.name) { toast('Введите название товара', 'err'); return; }
        if (!(d.price > 0)) { toast('Укажите цену', 'err'); return; }
        if (!d.photos.length) { toast('Добавьте хотя бы одно фото', 'err'); return; }
        if (!d.oldPrice) delete d.oldPrice;
        commit(function (data) {
          var i = -1; data.items.forEach(function (x, n) { if (x.id === d.id) i = n; });
          if (i >= 0) data.items[i] = d; else data.items.unshift(d);
        }, isNew ? 'Товар добавлен на сайт' : 'Изменения сохранены').then(function (ok) { if (ok) closeSheet(true); });
      }
    });
  }
  function itemForm(d, isNew) {
    var catOpts = D.cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === d.cat ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
    var tags = Object.keys(MF.TAGS).map(function (k) { return '<label><input type="checkbox" data-tag="' + k + '"' + (d.tags.indexOf(k) >= 0 ? ' checked' : '') + '><span>' + MF.TAGS[k] + '</span></label>'; }).join('');
    return '<div class="box"><div class="box-h"><b>Фото</b><span class="hint">Первое — главное</span></div><div class="media" id="edPhotos"></div></div>' +
      '<div class="box"><div class="box-h"><b>Видео</b><span class="hint">MP4 до 100 МБ, лучше до 30 сек</span></div><div class="media" id="edVideos"></div></div>' +
      '<label class="fld"><span>Название</span><input class="inp" data-k="name" value="' + esc(d.name) + '" placeholder="Например: Шуба из эко-меха голубая"></label>' +
      '<div class="row2"><label class="fld"><span>Категория</span><select class="inp" data-k="cat">' + catOpts + '</select></label>' +
      '<label class="fld"><span>Цвет</span><input class="inp" data-k="color" value="' + esc(d.color || '') + '" placeholder="Чёрный"></label></div>' +
      '<div class="row2"><label class="fld"><span>Цена, ₸</span><input class="inp" data-k="price" inputmode="numeric" value="' + esc(d.price || '') + '" placeholder="49900"></label>' +
      '<label class="fld"><span>Старая цена, ₸</span><input class="inp" data-k="oldPrice" inputmode="numeric" value="' + esc(d.oldPrice || '') + '" placeholder="если есть скидка"></label></div>' +
      '<label class="fld"><span>Описание</span><textarea class="inp" data-k="desc" rows="5" placeholder="Материал, крой, длина, с чем носить…">' + esc(d.desc || '') + '</textarea></label>' +
      '<div class="box"><div class="box-h"><b>Размеры и наличие</b></div>' +
        '<div class="hint">Быстро добавить сетку:</div><div class="presets" id="edPresets">' + Object.keys(MF.SIZE_PRESETS).map(function (k) { return '<button type="button" data-preset="' + k + '">' + MF.SIZE_PRESETS[k].name + '</button>'; }).join('') + '</div>' +
        '<div class="sizes-ed" id="edSizes"></div>' +
        '<div class="sz-add"><input class="inp" id="szNew" placeholder="Свой размер, напр. 44 или 23.5"><button type="button" class="btn btn-dark sm" id="szAdd">Добавить</button></div>' +
        '<div class="hint">Если размеров нет (например, сумка) — оставьте список пустым.</div></div>' +
      '<div class="fld"><span>Метки</span><div class="checks" id="edTags">' + tags + '</div></div>' +
      '<label class="fld" style="grid-template-columns:auto 1fr;align-items:center;gap:12px"><span class="sw"><input type="checkbox" id="edVis"' + (d.status !== 'hidden' ? ' checked' : '') + '><span></span></span><span>Показывать на сайте</span></label>' +
      (isNew ? '' : '<div class="danger-zone"><button type="button" class="btn btn-danger" id="edDel">Удалить товар</button></div>');
  }
  function mediaTile(ref, i, kind, n) {
    var isV = kind === 'video';
    return '<div class="mtile">' + (isV ? '<video src="' + esc(MF.src(ref)) + '#t=0.5" muted playsinline preload="metadata"></video><span class="play">▶</span>' : '<img src="' + esc(MF.src(ref)) + '" alt="">') +
      (!isV && i === 0 ? '<span class="main-l">Главное</span>' : '') +
      '<div class="mt-act">' + (n > 1 ? '<button type="button" data-mv="' + kind + ':' + i + ':-1" title="Левее">‹</button>' : '<span></span>') +
      '<button type="button" class="del" data-rm="' + kind + ':' + i + '" title="Удалить">✕</button>' +
      (n > 1 ? '<button type="button" data-mv="' + kind + ':' + i + ':1" title="Правее">›</button>' : '<span></span>') + '</div></div>';
  }
  function renderMedia() {
    var d = SH.data;
    $('#edPhotos').innerHTML = d.photos.map(function (r, i) { return mediaTile(r, i, 'photo', d.photos.length); }).join('') + '<button type="button" class="madd" data-addm="photo"><span><i>+</i>Фото</span></button>';
    $('#edVideos').innerHTML = d.videos.map(function (r, i) { return mediaTile(r, i, 'video', d.videos.length); }).join('') + '<button type="button" class="madd" data-addm="video"><span><i>+</i>Видео</span></button>';
  }
  function renderSizesEd() {
    var d = SH.data;
    $('#edSizes').innerHTML = d.sizes.map(function (s, i) {
      return '<div class="sz-row"><div><b>' + esc(s.s) + '</b>' + (+s.q > 0 ? '' : '<span class="out">нет в наличии</span>') + '</div>' +
        '<div class="step"><button type="button" data-q="' + i + ':-1">−</button><input type="number" min="0" data-qi="' + i + '" value="' + (+s.q || 0) + '"><button type="button" data-q="' + i + ':1">+</button></div>' +
        '<button type="button" class="sq" data-szrm="' + i + '" title="Убрать размер">✕</button></div>';
    }).join('');
  }
  $('#sheetForm').addEventListener('click', function (e) {
    if (!SH || !SH.data || !SH.data.sizes) return;
    var d = SH.data, b;
    if ((b = e.target.closest('[data-addm]'))) {
      var kind = b.getAttribute('data-addm');
      pickFiles(kind === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/*', true).then(function (files) {
        if (!files.length) return;
        uploadMany(files, kind).then(function (refs) {
          if (!SH) return;
          d[kind === 'video' ? 'videos' : 'photos'] = d[kind === 'video' ? 'videos' : 'photos'].concat(refs);
          SH.dirty = true; renderMedia(); if (refs.length) toast(refs.length > 1 ? 'Загружено: ' + refs.length : 'Загружено', 'ok');
        });
      });
      return;
    }
    if ((b = e.target.closest('[data-rm]'))) {
      var p = b.getAttribute('data-rm').split(':'), arr = d[p[0] === 'video' ? 'videos' : 'photos'];
      if (confirm(p[0] === 'video' ? 'Убрать это видео?' : 'Убрать это фото?')) { arr.splice(+p[1], 1); SH.dirty = true; renderMedia(); }
      return;
    }
    if ((b = e.target.closest('[data-mv]'))) {
      var m = b.getAttribute('data-mv').split(':'), a = d[m[0] === 'video' ? 'videos' : 'photos'], i = +m[1], j = i + +m[2];
      if (j < 0 || j >= a.length) return;
      var t = a[i]; a[i] = a[j]; a[j] = t; SH.dirty = true; renderMedia(); return;
    }
    if ((b = e.target.closest('[data-preset]'))) {
      var list = MF.SIZE_PRESETS[b.getAttribute('data-preset')].list;
      list.forEach(function (s) { if (!d.sizes.some(function (x) { return x.s === s; })) d.sizes.push({ s: s, q: 1 }); });
      SH.dirty = true; renderSizesEd(); return;
    }
    if ((b = e.target.closest('[data-q]'))) {
      var q = b.getAttribute('data-q').split(':'), s = d.sizes[+q[0]]; s.q = Math.max(0, (+s.q || 0) + +q[1]); SH.dirty = true; renderSizesEd(); return;
    }
    if ((b = e.target.closest('[data-szrm]'))) { d.sizes.splice(+b.getAttribute('data-szrm'), 1); SH.dirty = true; renderSizesEd(); return; }
    if (e.target.closest('#szAdd')) { addSize(); return; }
    if (e.target.closest('#edDel')) {
      if (confirm('Удалить «' + (d.name || 'товар') + '» навсегда?')) commit(function (data) { data.items = data.items.filter(function (x) { return x.id !== d.id; }); }, 'Товар удалён').then(function (ok) { if (ok) closeSheet(true); });
    }
    var mt = e.target.closest('.mtile video'); if (mt) { mt.paused ? mt.play() : mt.pause(); }
  });
  function addSize() {
    var v = $('#szNew').value.trim(); if (!v) return;
    if (SH.data.sizes.some(function (x) { return x.s.toLowerCase() === v.toLowerCase(); })) { toast('Такой размер уже есть'); return; }
    SH.data.sizes.push({ s: v.toUpperCase(), q: 1 }); SH.dirty = true; $('#szNew').value = ''; renderSizesEd();
  }
  $('#sheetForm').addEventListener('keydown', function (e) { if (e.target.id === 'szNew' && e.key === 'Enter') { e.preventDefault(); addSize(); } });
  $('#sheetForm').addEventListener('change', function (e) {
    if (!SH || !SH.data) return;
    var d = SH.data;
    if (e.target.hasAttribute('data-qi')) { d.sizes[+e.target.getAttribute('data-qi')].q = Math.max(0, Math.round(+e.target.value) || 0); SH.dirty = true; renderSizesEd(); }
    if (e.target.hasAttribute('data-tag')) { var t = e.target.getAttribute('data-tag'); d.tags = d.tags.filter(function (x) { return x !== t; }); if (e.target.checked) d.tags.push(t); SH.dirty = true; }
    if (e.target.id === 'edVis') { d.status = e.target.checked ? 'active' : 'hidden'; SH.dirty = true; }
  });

  /* ================= КАТЕГОРИИ ================= */
  function renderCats() {
    var counts = {}; D.items.forEach(function (it) { counts[it.cat] = (counts[it.cat] || 0) + 1; });
    $('#catRows').innerHTML = D.cats.map(function (c, i) {
      return '<div class="row"><span style="width:40px;height:40px;border-radius:50%;background:var(--pink-3);display:grid;place-items:center;color:var(--pink-d)">' + MF.icon(c.icon).replace('class="ico"', 'class="ico" width="22" height="22"') + '</span>' +
        '<div class="grow"><b>' + esc(c.name) + '</b><small>' + (counts[c.id] || 0) + ' товаров</small></div>' +
        '<div class="ord-btns"><button class="sq" data-cmv="' + i + ':-1"' + (i ? '' : ' disabled') + '>↑</button><button class="sq" data-cmv="' + i + ':1"' + (i < D.cats.length - 1 ? '' : ' disabled') + '>↓</button></div>' +
        '<button class="mini" data-cedit="' + esc(c.id) + '">Изменить</button></div>';
    }).join('') || '<div class="empty">Категорий нет</div>';
  }
  $('#catRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cmv]');
    if (b) { var p = b.getAttribute('data-cmv').split(':'), i = +p[0], j = i + +p[1]; commit(function (d) { var t = d.cats[i]; d.cats[i] = d.cats[j]; d.cats[j] = t; }, 'Порядок сохранён'); return; }
    b = e.target.closest('[data-cedit]');
    if (b) editCat(clone(D.cats.filter(function (c) { return c.id === b.getAttribute('data-cedit'); })[0]), false);
  });
  $('#addCat').addEventListener('click', function () { editCat({ id: MF.uid('c'), name: '', icon: 'sweat' }, true); });
  function editCat(c, isNew) {
    var n = D.items.filter(function (it) { return it.cat === c.id; }).length;
    openSheet({
      title: isNew ? 'Новая категория' : 'Категория', data: c,
      render: function () {
        $('#sheetForm').innerHTML = '<label class="fld"><span>Название</span><input class="inp" data-k="name" value="' + esc(c.name) + '" placeholder="Например: Платья"></label>' +
          '<div class="fld"><span>Значок</span><div class="checks">' + Object.keys(MF.ICONS).filter(function (k) { return k !== 'all'; }).map(function (k) {
            return '<label><input type="radio" name="icon" value="' + k + '"' + (c.icon === k ? ' checked' : '') + '><span style="width:52px;justify-content:center">' + MF.icon(k).replace('class="ico"', 'width="22" height="22"') + '</span></label>';
          }).join('') + '</div></div>' +
          (isNew ? '' : '<div class="danger-zone"><button type="button" class="btn btn-danger" id="catDel">Удалить категорию</button>' + (n ? '<p class="hint">В категории ' + n + ' товаров — сначала перенесите их в другую категорию.</p>' : '') + '</div>');
        $$('[name=icon]').forEach(function (r) { r.addEventListener('change', function () { c.icon = r.value; SH.dirty = true; }); });
        var del = $('#catDel');
        if (del) del.addEventListener('click', function () {
          if (n) { toast('Сначала перенесите товары из этой категории', 'err'); return; }
          if (confirm('Удалить категорию «' + c.name + '»?')) commit(function (d) { d.cats = d.cats.filter(function (x) { return x.id !== c.id; }); }, 'Категория удалена').then(function (ok) { if (ok) closeSheet(true); });
        });
      },
      save: function () {
        c.name = (c.name || '').trim(); if (!c.name) { toast('Введите название', 'err'); return; }
        commit(function (d) { var i = -1; d.cats.forEach(function (x, k) { if (x.id === c.id) i = k; }); if (i >= 0) d.cats[i] = c; else d.cats.push(c); }, 'Категория сохранена').then(function (ok) { if (ok) closeSheet(true); });
      }
    });
  }

  /* ================= БАННЕРЫ ================= */
  function renderPromos() {
    $('#promoRows').innerHTML = D.promos.map(function (p) {
      var live = MF.promoLive(p);
      return '<div class="row">' + (p.image ? '<img src="' + esc(MF.src(p.image)) + '" alt="">' : '<span style="width:56px;height:56px;border-radius:10px;background:var(--pink);flex:none"></span>') +
        '<div class="grow"><b>' + esc(p.title || 'Без названия') + '</b><small>' + (live ? '🟢 На сайте' : '⚪️ Не показывается') + (+p.percent > 0 ? ' · скидка ' + p.percent + '%' : '') + (p.to ? ' · до ' + esc(p.to) : '') + '</small></div>' +
        '<button class="mini" data-pedit="' + esc(p.id) + '">Изменить</button></div>';
    }).join('') || '<div class="empty">Баннеров нет</div>';
  }
  $('#promoRows').addEventListener('click', function (e) { var b = e.target.closest('[data-pedit]'); if (b) editPromo(clone(D.promos.filter(function (p) { return p.id === b.getAttribute('data-pedit'); })[0]), false); });
  $('#addPromo').addEventListener('click', function () { editPromo({ id: MF.uid('p'), active: true, title: '', text: '', image: '', percent: 0, applyTo: 'none', cats: [], items: [], from: '', to: '' }, true); });
  function editPromo(p, isNew) {
    p.cats = p.cats || []; p.items = p.items || [];
    openSheet({
      title: isNew ? 'Новый баннер' : 'Баннер', data: p,
      render: function () {
        $('#sheetForm').innerHTML =
          '<label class="fld" style="grid-template-columns:auto 1fr;align-items:center;gap:12px"><span class="sw"><input type="checkbox" data-k="active"' + (p.active ? ' checked' : '') + '><span></span></span><span>Показывать на сайте</span></label>' +
          '<label class="fld"><span>Заголовок</span><input class="inp" data-k="title" value="' + esc(p.title) + '" placeholder="Скидка 20% на все шубы"></label>' +
          '<label class="fld"><span>Текст</span><textarea class="inp" data-k="text" rows="2" style="min-height:70px">' + esc(p.text || '') + '</textarea></label>' +
          '<div class="box"><div class="box-h"><b>Картинка</b><span class="hint">необязательно</span></div><div class="media" id="prImg"></div></div>' +
          '<div class="box"><div class="box-h"><b>Скидка</b></div>' +
            '<div class="row2"><label class="fld"><span>Скидка, %</span><input class="inp" data-k="percent" inputmode="numeric" value="' + esc(p.percent || '') + '" placeholder="0 — без скидки"></label>' +
            '<label class="fld"><span>На что</span><select class="inp" data-k="applyTo"><option value="none"' + (p.applyTo === 'none' ? ' selected' : '') + '>Без скидки</option><option value="all"' + (p.applyTo === 'all' ? ' selected' : '') + '>Весь каталог</option><option value="cat"' + (p.applyTo === 'cat' ? ' selected' : '') + '>Категории</option><option value="items"' + (p.applyTo === 'items' ? ' selected' : '') + '>Выбранные товары</option></select></label></div>' +
            '<div class="fld" id="prCats"' + (p.applyTo === 'cat' ? '' : ' hidden') + '><span>Категории</span><div class="checks">' + D.cats.map(function (c) { return '<label><input type="checkbox" data-pc="' + esc(c.id) + '"' + (p.cats.indexOf(c.id) >= 0 ? ' checked' : '') + '><span>' + esc(c.name) + '</span></label>'; }).join('') + '</div></div>' +
            '<div class="fld" id="prItems"' + (p.applyTo === 'items' ? '' : ' hidden') + '><span>Товары</span><div class="checks">' + D.items.map(function (it) { return '<label><input type="checkbox" data-pi="' + esc(it.id) + '"' + (p.items.indexOf(it.id) >= 0 ? ' checked' : '') + '><span>' + esc(it.name) + '</span></label>'; }).join('') + '</div></div>' +
            '<div class="row2"><label class="fld"><span>С даты</span><input class="inp" type="date" data-k="from" value="' + esc(p.from || '') + '"></label><label class="fld"><span>По дату</span><input class="inp" type="date" data-k="to" value="' + esc(p.to || '') + '"></label></div>' +
            '<div class="hint">Цены со скидкой сайт посчитает сам и покажет зачёркнутую старую цену.</div></div>' +
          (isNew ? '' : '<div class="danger-zone"><button type="button" class="btn btn-danger" id="prDel">Удалить баннер</button></div>');
        renderPrImg();
        $('[data-k=applyTo]').addEventListener('change', function (e) { $('#prCats').hidden = e.target.value !== 'cat'; $('#prItems').hidden = e.target.value !== 'items'; });
        $$('[data-pc]').forEach(function (x) { x.addEventListener('change', function () { var id = x.getAttribute('data-pc'); p.cats = p.cats.filter(function (c) { return c !== id; }); if (x.checked) p.cats.push(id); SH.dirty = true; }); });
        $$('[data-pi]').forEach(function (x) { x.addEventListener('change', function () { var id = x.getAttribute('data-pi'); p.items = p.items.filter(function (c) { return c !== id; }); if (x.checked) p.items.push(id); SH.dirty = true; }); });
        var del = $('#prDel'); if (del) del.addEventListener('click', function () { if (confirm('Удалить баннер?')) commit(function (d) { d.promos = d.promos.filter(function (x) { return x.id !== p.id; }); }, 'Баннер удалён').then(function (ok) { if (ok) closeSheet(true); }); });
      },
      save: function () {
        p.title = (p.title || '').trim(); p.percent = Math.max(0, Math.min(90, Math.round(+p.percent) || 0));
        if (!p.title) { toast('Введите заголовок', 'err'); return; }
        if (p.percent && p.applyTo === 'none') p.applyTo = 'all';
        commit(function (d) { var i = -1; d.promos.forEach(function (x, k) { if (x.id === p.id) i = k; }); if (i >= 0) d.promos[i] = p; else d.promos.unshift(p); }, 'Баннер сохранён').then(function (ok) { if (ok) closeSheet(true); });
      }
    });
    function renderPrImg() {
      $('#prImg').innerHTML = (p.image ? '<div class="mtile"><img src="' + esc(MF.src(p.image)) + '" alt=""><div class="mt-act"><span></span><button type="button" class="del" id="prImgRm">✕</button><span></span></div></div>' : '') + '<button type="button" class="madd" id="prImgAdd"><span><i>+</i>' + (p.image ? 'Заменить' : 'Картинка') + '</span></button>';
      $('#prImgAdd').addEventListener('click', function () { pickFiles('image/*').then(function (f) { if (f.length) uploadMany(f.slice(0, 1), 'photo').then(function (r) { if (r[0] && SH) { p.image = r[0]; SH.dirty = true; renderPrImg(); } }); }); });
      var rm = $('#prImgRm'); if (rm) rm.addEventListener('click', function () { p.image = ''; SH.dirty = true; renderPrImg(); });
    }
  }

  /* ================= НАСТРОЙКИ ================= */
  var SET_FIELDS = [
    ['name', 'Название магазина'], ['notice', 'Строка над шапкой сайта'], ['city', 'Город'], ['address', 'Адрес'], ['hours', 'Режим работы'],
    ['whatsapp', 'WhatsApp (для заказов и вопросов)', 'tel'], ['instagram', 'Instagram (без @)'],
    ['heroTitle', 'Заголовок на главном экране (вторая строка — розовым)', 'area2'], ['heroText', 'Текст на главном экране', 'area'], ['about', 'О магазине (абзацы через пустую строку)', 'area']
  ];
  function renderSettings() {
    var s = D.settings;
    $('#setForm').innerHTML = SET_FIELDS.map(function (f) {
      var v = esc(s[f[0]] || '');
      return '<label class="fld"><span>' + f[1] + '</span>' + (f[2] && f[2].indexOf('area') === 0 ? '<textarea class="inp" name="' + f[0] + '" rows="' + (f[2] === 'area2' ? 2 : 5) + '"' + (f[2] === 'area2' ? ' style="min-height:70px"' : '') + '>' + v + '</textarea>' : '<input class="inp" name="' + f[0] + '" value="' + v + '"' + (f[2] === 'tel' ? ' inputmode="tel"' : '') + '>') + '</label>';
    }).join('') +
      '<div class="box"><div class="box-h"><b>Доставка и оплата</b><button type="button" class="mini" id="dlAdd">+ Пункт</button></div><div id="dlRows" class="list"></div></div>' +
      '<button class="btn btn-pink" type="submit">Сохранить</button>';
    renderDl();
  }
  var DL = null;
  function renderDl() {
    DL = DL || clone(D.settings.delivery);
    $('#dlRows').innerHTML = DL.map(function (d, i) {
      return '<div class="row" style="display:grid;gap:6px"><input class="inp" data-dl="' + i + ':t" value="' + esc(d.t) + '" placeholder="Заголовок"><textarea class="inp" data-dl="' + i + ':d" rows="2" style="min-height:60px" placeholder="Описание">' + esc(d.d) + '</textarea><button type="button" class="mini gray" data-dlrm="' + i + '" style="justify-self:start">Удалить пункт</button></div>';
    }).join('');
  }
  $('#setForm').addEventListener('input', function (e) { var k = e.target.getAttribute('data-dl'); if (k) { var p = k.split(':'); DL[+p[0]][p[1]] = e.target.value; } });
  $('#setForm').addEventListener('click', function (e) {
    if (e.target.closest('#dlAdd')) { DL.push({ t: '', d: '' }); renderDl(); }
    var rm = e.target.closest('[data-dlrm]'); if (rm) { DL.splice(+rm.getAttribute('data-dlrm'), 1); renderDl(); }
  });
  $('#setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, vals = {};
    SET_FIELDS.forEach(function (x) { vals[x[0]] = f.elements[x[0]].value.trim(); });
    vals.whatsapp = MF.digits(vals.whatsapp);
    if (vals.whatsapp.length !== 11) { toast('WhatsApp: введите номер полностью, 11 цифр', 'err'); return; }
    vals.instagram = vals.instagram.replace(/^@/, '');
    var dl = DL.filter(function (d) { return (d.t || '').trim(); });
    commit(function (d) { Object.assign(d.settings, vals); d.settings.delivery = dl; }, 'Настройки сохранены').then(function () { DL = null; });
  });
})();
