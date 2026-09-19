(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ui = {
    app: $('app'), book: $('book'), viewer: $('viewer-shell'), zoomStage: $('zoom-stage'),
    loading: $('loading'), loadingDetail: $('loading-detail'), error: $('error'), errorMessage: $('error-message'),
    title: $('book-title'), company: $('company'), footerCompany: $('footer-company'), author: $('author'),
    mode: $('mode-label'), prev: $('prev'), next: $('next'), pageInput: $('page-input'),
    total: $('page-total'), zoomIn: $('zoom-in'), zoomOut: $('zoom-out'), zoomValue: $('zoom-value'),
    fullscreen: $('fullscreen'), retry: $('retry')
  };
  let flipBook = null;
  let zoom = 1;
  let pageNodes = [];
  let requestNearby = () => {};

  function currentFolderUrl(file) { return new URL(file, window.location.href).href; }
  function safeText(value, fallback) { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
  function setLoading(message) { ui.loadingDetail.textContent = message; }
  function showError(error) {
    ui.loading.hidden = true;
    ui.error.hidden = false;
    ui.errorMessage.textContent = error && error.message ? error.message : String(error);
    ui.app.setAttribute('aria-busy', 'false');
  }
  function updateControls(pageIndex) {
    const total = flipBook ? flipBook.getPageCount() : Number(ui.total.textContent) || 0;
    ui.pageInput.value = String(pageIndex + 1);
    ui.prev.disabled = pageIndex <= 0;
    ui.next.disabled = pageIndex >= total - 1;
    history.replaceState(null, '', '#p=' + (pageIndex + 1));
  }
  function requestedPage(total) {
    const match = location.hash.match(/(?:^#|&)p=(\d+)/);
    return Math.max(0, Math.min(total - 1, match ? Number(match[1]) - 1 : 0));
  }
  function applyZoom(nextZoom) {
    zoom = Math.max(0.6, Math.min(2, Math.round(nextZoom * 10) / 10));
    ui.book.style.transform = 'scale(' + zoom + ')';
    ui.book.style.transformOrigin = 'center center';
    ui.zoomValue.value = Math.round(zoom * 100) + '%';
    ui.zoomOut.disabled = zoom <= 0.6;
    ui.zoomIn.disabled = zoom >= 2;
  }
  function pageUrls(pattern, count) {
    return Array.from({ length: count }, (_, index) => {
      const page = String(index + 1).padStart(2, '0');
      return currentFolderUrl(pattern.replace('{page}', page));
    });
  }
  function preparePages(urls) {
    const loaded = new Set(), pending = new Map();
    let queue = [], active = 0;
    let visible = new Set();
    pageNodes = urls.map((url, index) => {
      const node = document.createElement('div');
      node.style.cssText = 'background-color:#fffdf8;color:#102a3a;overflow:hidden';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = '第 ' + (index + 1) + ' 頁載入中…';
      retry.style.cssText = 'width:100%;height:100%;border:0;background:#fffdf8;color:#102a3a';
      retry.addEventListener('click', () => requestNearby(index));
      node.appendChild(retry);
      return node;
    });
    function load(index) {
      if (loaded.has(index)) return Promise.resolve(pageNodes[index].firstChild);
      if (pending.has(index)) return pending.get(index).promise;
      const entry = {};
      const task = new Promise((resolve, reject) => {
        const img = new Image();
        img.alt = '第 ' + (index + 1) + ' 頁';
        img.draggable = false;
        img.fetchPriority = visible.has(index) || !flipBook ? 'high' : 'low';
        img.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;background:#fffdf8';
        img.onload = () => { pageNodes[index].replaceChildren(img); loaded.add(index); resolve(img); };
        img.onerror = () => reject(new Error('第 ' + (index + 1) + ' 頁載入失敗'));
        entry.cancel = () => {
          img.onload = img.onerror = null;
          img.src = '';
          resolve(null);
        };
        img.src = urls[index];
      }).finally(() => pending.delete(index));
      entry.promise = task;
      pending.set(index, entry);
      return task;
    }
    function drain() {
      while (active < 2 && queue.length) {
        const index = queue.shift();
        if (loaded.has(index) || pending.has(index)) continue;
        active++;
        load(index).catch(() => {
          pageNodes[index].firstChild.textContent = '載入失敗，點此重試';
        }).finally(() => { active--; drain(); });
      }
    }
    requestNearby = (index) => {
      // Cancel stale preloads so a jump never waits for a previous spread.
      visible = new Set([index, index + 1]);
      queue = [index, index + 1, index - 1, index + 2, index + 3, index + 4, index + 5, index - 2]
        .filter(i => i >= 0 && i < urls.length && !loaded.has(i));
      if ([...visible].some(i => i < urls.length && !loaded.has(i))) {
        pending.forEach((entry, i) => { if (!visible.has(i)) entry.cancel(); });
      }
      drain();
    };
    return load;
  }
  function createFlipbook(urls, firstPage, ratio) {
    const availableHeight = Math.max(360, ui.viewer.clientHeight - 24);
    const maxPageHeight = Math.min(availableHeight, 1040);
    const maxPageWidth = Math.round(maxPageHeight * ratio);
    flipBook = new St.PageFlip(ui.book, {
      width: 560, height: Math.round(560 / ratio), size: 'stretch',
      minWidth: 260, maxWidth: maxPageWidth, minHeight: 360, maxHeight: maxPageHeight,
      maxShadowOpacity: 0.45, showCover: true, usePortrait: true,
      mobileScrollSupport: false, swipeDistance: 28, flippingTime: 650,
      autoSize: true, startPage: firstPage
    });
    flipBook.on('flip', (e) => { updateControls(e.data); requestNearby(e.data); });
    flipBook.on('changeOrientation', (e) => { ui.mode.textContent = e.data === 'portrait' ? '單頁模式' : '雙頁模式'; });
    flipBook.on('init', (e) => { ui.mode.textContent = e.data.mode === 'portrait' ? '單頁模式' : '雙頁模式'; updateControls(e.data.page); });
    flipBook.loadFromHTML(pageNodes);
  }
  async function start() {
    try {
      ui.error.hidden = true; ui.loading.hidden = false;
      if (!window.St || !window.St.PageFlip) throw new Error('核心套件未載入，請確認 vendor 資料夾已完整上傳。');
      setLoading('讀取 config.json…');
      const response = await fetch(currentFolderUrl('config.json'), { cache: 'no-store' });
      if (!response.ok) throw new Error('找不到 config.json（HTTP ' + response.status + '）。');
      const config = await response.json();
      const title = safeText(config.title, '電子旅遊手冊');
      const company = safeText(config.company, '長運旅行社');
      const author = safeText(config.author, '巫安迪');
      const pattern = safeText(config.pagePattern, 'pages/page-{page}.jpg');
      const count = Math.max(1, Number(config.pageCount) || 1);
      ui.title.textContent = title;
      ui.company.textContent = company; ui.footerCompany.textContent = company;
      ui.author.textContent = author + '製作'; document.title = title + '｜' + company;
      ui.total.textContent = String(count); ui.pageInput.max = String(count);
      setLoading('正在開啟第 1 頁…');
      const urls = pageUrls(pattern, count);
      const firstPage = requestedPage(count);
      const load = preparePages(urls);
      const firstImage = await load(firstPage);
      const ratio = firstImage.naturalWidth / firstImage.naturalHeight;
      createFlipbook(urls, firstPage, ratio);
      ui.loading.hidden = true; ui.app.setAttribute('aria-busy', 'false');
      requestNearby(firstPage);
    } catch (error) { console.error(error); showError(error); }
  }
  ui.prev.addEventListener('click', () => flipBook && flipBook.flipPrev('top'));
  ui.next.addEventListener('click', () => flipBook && flipBook.flipNext('top'));
  ui.pageInput.addEventListener('change', () => { if (!flipBook) return; const n = Math.max(1, Math.min(flipBook.getPageCount(), Number(ui.pageInput.value) || 1)); flipBook.turnToPage(n - 1); updateControls(n - 1); });
  ui.zoomIn.addEventListener('click', () => applyZoom(zoom + 0.2));
  ui.zoomOut.addEventListener('click', () => applyZoom(zoom - 0.2));
  ui.fullscreen.addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch (_) {} });
  ui.retry.addEventListener('click', () => location.reload());
  document.addEventListener('keydown', (e) => { if (/input/i.test(e.target.tagName)) return; if (e.key === 'ArrowLeft') ui.prev.click(); if (e.key === 'ArrowRight') ui.next.click(); if (e.key === '+' || e.key === '=') ui.zoomIn.click(); if (e.key === '-') ui.zoomOut.click(); });
  applyZoom(1); start();
}());

