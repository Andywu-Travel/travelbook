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
  let objectUrls = [];

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
  async function canvasToUrl(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('無法建立頁面影像。'));
      const url = URL.createObjectURL(blob); objectUrls.push(url); resolve(url);
    }, 'image/jpeg', 0.92));
  }
  async function renderPage(pdf, pageNumber, targetWidth) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, Math.max(1, targetWidth / base.width));
    const viewport = page.getViewport({ scale: scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    page.cleanup();
    return canvasToUrl(canvas);
  }
  async function renderAll(pdf) {
    const urls = new Array(pdf.numPages);
    const targetWidth = Math.min(1600, Math.max(1000, window.innerWidth * (window.innerWidth >= 800 ? 0.7 : 1.6)));
    let cursor = 1;
    async function worker() {
      while (cursor <= pdf.numPages) {
        const pageNo = cursor++;
        setLoading('正在準備第 ' + pageNo + ' / ' + pdf.numPages + ' 頁…');
        urls[pageNo - 1] = await renderPage(pdf, pageNo, targetWidth);
      }
    }
    await Promise.all([worker(), worker()]);
    return urls;
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
    flipBook.on('flip', (e) => updateControls(e.data));
    flipBook.on('changeOrientation', (e) => { ui.mode.textContent = e.data === 'portrait' ? '單頁模式' : '雙頁模式'; });
    flipBook.on('init', (e) => { ui.mode.textContent = e.data.mode === 'portrait' ? '單頁模式' : '雙頁模式'; updateControls(e.data.page); });
    flipBook.loadFromImages(urls);
  }
  async function start() {
    try {
      ui.error.hidden = true; ui.loading.hidden = false;
      if (!window.pdfjsLib || !window.St || !window.St.PageFlip) throw new Error('核心套件未載入，請確認 vendor 資料夾已完整上傳。');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '../../vendor/pdfjs/pdf.worker.min.js';
      setLoading('讀取 config.json…');
      const response = await fetch(currentFolderUrl('config.json'), { cache: 'no-store' });
      if (!response.ok) throw new Error('找不到 config.json（HTTP ' + response.status + '）。');
      const config = await response.json();
      const title = safeText(config.title, '電子旅遊手冊');
      const company = safeText(config.company, '長運旅行社');
      const author = safeText(config.author, '巫安迪');
      const pdfName = safeText(config.pdf, 'book.pdf');
      ui.title.textContent = title;
      ui.company.textContent = company; ui.footerCompany.textContent = company;
      ui.author.textContent = author + '製作'; document.title = title + '｜' + company;
      setLoading('正在讀取 PDF…');
      const pdf = await pdfjsLib.getDocument({ url: currentFolderUrl(pdfName), cMapPacked: true }).promise;
      ui.total.textContent = String(pdf.numPages); ui.pageInput.max = String(pdf.numPages);
      const firstPdfPage = await pdf.getPage(1); const viewport = firstPdfPage.getViewport({ scale: 1 }); firstPdfPage.cleanup();
      const urls = await renderAll(pdf);
      createFlipbook(urls, requestedPage(pdf.numPages), viewport.width / viewport.height);
      ui.loading.hidden = true; ui.app.setAttribute('aria-busy', 'false');
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
  window.addEventListener('beforeunload', () => objectUrls.forEach(URL.revokeObjectURL));
  applyZoom(1); start();
}());
