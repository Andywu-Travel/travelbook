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
    if (flipBook) requestNearby(flipBook.getCurrentPageIndex());
  }
  function pageUrls(pattern, count) {
    return Array.from({ length: count }, (_, index) => {
      const page = String(index + 1).padStart(2, '0');
      return currentFolderUrl(pattern.replace('{page}', page));
    });
  }
  function preparePages(urls, lightweightUrls) {
    const loaded = new Map(), pending = new Map();
    const compact = window.matchMedia('(max-width: 700px)');
    let queue = [], visible = new Set();
    const isValid = index => index >= 0 && index < urls.length;
    const wantsOriginal = index => !lightweightUrls || !compact.matches ||
      (visible.has(index) && zoom * (window.visualViewport?.scale || 1) > 1.05);
    const isReady = index => loaded.has(index) && (!wantsOriginal(index) || loaded.get(index).original);
    pageNodes = urls.map((url, index) => {
      const node = document.createElement('div');
      node.style.cssText = 'background-color:#fffdf8;color:#102a3a;overflow:hidden';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = '第 ' + (index + 1) + ' 頁載入中…';
      retry.style.cssText = 'width:100%;height:100%;border:0;background:#fffdf8;color:#102a3a';
      retry.addEventListener('click', () => requestNearby(flipBook ? flipBook.getCurrentPageIndex() : index));
      node.appendChild(retry);
      return node;
    });
    function load(index) {
      if (isReady(index)) return Promise.resolve(loaded.get(index).image);
      if (pending.has(index)) return pending.get(index).promise;
      const entry = { original: wantsOriginal(index) };
      entry.promise = new Promise((resolve, reject) => {
        const img = new Image();
        img.alt = '第 ' + (index + 1) + ' 頁';
        img.draggable = false;
        img.fetchPriority = visible.has(index) || !flipBook ? 'high' : 'low';
        img.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;background:#fffdf8';
        img.onload = () => {
          pageNodes[index].replaceChildren(img);
          loaded.set(index, { image: img, original: entry.original });
          resolve(img);
        };
        img.onerror = () => {
          // A missing/unsupported lightweight image must not block reading.
          if (!entry.original) { entry.original = true; img.src = urls[index]; return; }
          reject(new Error('第 ' + (index + 1) + ' 頁載入失敗'));
        };
        entry.cancel = () => {
          img.onload = img.onerror = null;
          img.removeAttribute('src');
          if (pending.get(index) === entry) pending.delete(index);
          resolve(null);
        };
        img.src = entry.original ? urls[index] : lightweightUrls[index];
      }).finally(() => { if (pending.get(index) === entry) pending.delete(index); });
      pending.set(index, entry);
      return entry.promise;
    }
    function showPageError(index) {
      let retry = pageNodes[index].querySelector('button');
      if (!retry) {
        retry = document.createElement('button');
        retry.type = 'button';
        retry.style.cssText = 'position:absolute;bottom:8px;left:5%;width:90%;padding:10px;border:0;border-radius:6px;background:#082f49;color:white';
        retry.addEventListener('click', () => requestNearby(flipBook.getCurrentPageIndex()));
        pageNodes[index].appendChild(retry);
      }
      retry.textContent = loaded.has(index) ? '高清圖片未載入，點此重試' : '載入失敗，點此重試';
    }
    function drain() {
      while (pending.size < 2 && queue.length) {
        const index = queue.shift();
        if (isReady(index) || pending.has(index)) continue;
        load(index).catch(() => showPageError(index)).finally(drain);
      }
    }
    requestNearby = (index) => {
      const spread = flipBook && flipBook.getOrientation() === 'landscape' && index > 0
        ? [index, index + 1] : [index];
      visible = new Set(spread.filter(isValid));
      queue = [...new Set([...visible, index + 1, index + 2, index - 1, index + 3])]
        .filter(i => isValid(i) && !isReady(i));
      const needsVisible = [...visible].some(i => !isReady(i));
      pending.forEach((entry, i) => {
        if ((!visible.has(i) && (needsVisible || !queue.includes(i))) ||
            (wantsOriginal(i) && !entry.original)) entry.cancel();
      });
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
    flipBook.on('changeOrientation', (e) => { ui.mode.textContent = e.data === 'portrait' ? '單頁模式' : '雙頁模式'; requestNearby(flipBook.getCurrentPageIndex()); });
    flipBook.on('init', (e) => { ui.mode.textContent = e.data.mode === 'portrait' ? '單頁模式' : '雙頁模式'; updateControls(e.data.page);
      if ($('cover-preview')) $('cover-preview').hidden = true;
      ui.loading.hidden = true; ui.app.setAttribute('aria-busy', 'false');
      ui.pageInput.disabled = false;
      requestNearby(e.data.page);
    });
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
      const lightweightUrls = config.mobilePagePattern ? pageUrls(config.mobilePagePattern, count) : null;
      const load = preparePages(urls, lightweightUrls);
      const firstImage = await load(firstPage);
      const ratio = firstImage.naturalWidth / firstImage.naturalHeight;
      createFlipbook(urls, firstPage, ratio);
      requestNearby(flipBook.getCurrentPageIndex());
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
  window.visualViewport?.addEventListener('resize', () => { if (flipBook) requestNearby(flipBook.getCurrentPageIndex()); });
  window.addEventListener('resize', () => { if (flipBook) requestNearby(flipBook.getCurrentPageIndex()); });
  applyZoom(1); start();
}());

