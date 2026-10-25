import { artist, works } from './data/works.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const mainPhoto = $('main-photo');
const photoButton = $('photo-open');
const lightbox = $('lightbox');
const about = $('about-dialog');
const imageCache = new Map();
let currentIndex = 0;
let currentView = 'work';
let shownId = '';
let indexScroll = 0;
let zoomed = false;
let renderToken = 0;
let detailToken = 0;
let loadingTimer;
let suppressClickUntil = 0;
let lastLightboxOpener = null;
let lightboxWorkId = '';
let pendingFocusToken = null;
history.scrollRestoration = 'manual';

function readRoute() {
  const params = new URLSearchParams(location.hash.slice(1));
  const index = works.findIndex((work) => work.id === params.get('photo'));
  return { index: Math.max(0, index), view: params.get('view') === 'index' ? 'index' : 'work' };
}

function focusIndexWork() {
  const button = $('index-grid').querySelector(`[data-id="${works[currentIndex].id}"]`);
  button?.focus({ preventScroll: true });
  if (button) {
    const bounds = button.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > innerHeight) button.scrollIntoView({ block: 'nearest' });
  }
}

function focusView() {
  if (currentView === 'index') { window.scrollTo(0, indexScroll); focusIndexWork(); }
  else { window.scrollTo(0, 0); (photoButton.hidden ? $('main') : photoButton).focus({ preventScroll: true }); }
}

function navigate(index, view = currentView, { replace = false, focus = false, force = false } = {}) {
  const nextIndex = Math.max(0, Math.min(works.length - 1, index));
  if (!force && nextIndex === currentIndex && view === currentView) return;
  if (currentView === 'index') indexScroll = window.scrollY;
  currentIndex = nextIndex;
  currentView = view;
  const params = new URLSearchParams({ photo: works[currentIndex].id });
  if (view === 'index') params.set('view', 'index');
  const hash = `#${params}`;
  if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash);
  render({ focusAfterLoad: focus && view === 'work' });
  if (focus) requestAnimationFrame(focusView);
}

function displaySource(work) {
  const style = getComputedStyle($('stage'));
  const availableWidth = $('stage').clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availableHeight = $('stage').clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const width = Math.min(availableWidth, availableHeight * work.width / work.height);
  const needed = width * Math.min(devicePixelRatio || 1, 2);
  const variants = work.variants || [{ src: work.src, width: work.width }];
  return (variants.find((variant) => variant.width >= needed) || variants.at(-1)).src;
}

function loadImage(src, priority = 'low') {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = priority;
    image.onload = async () => {
      try { await image.decode(); } catch { /* onload already verified a usable image */ }
      resolve(image);
    };
    image.onerror = () => { imageCache.delete(src); reject(new Error(`Image unavailable: ${src}`)); };
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

function preloadNeighbours() {
  for (const index of [currentIndex + 1, currentIndex - 1]) {
    if (works[index]) loadImage(displaySource(works[index])).catch(() => {});
  }
}

function updateControls() {
  const last = currentIndex === works.length - 1;
  $('previous').disabled = currentIndex === 0;
  $('lightbox-previous').disabled = currentIndex === 0;
  for (const [id, label] of [['next', '次の写真'], ['lightbox-next', '拡大表示で次の写真']]) {
    const button = $(id);
    button.setAttribute('aria-label', last ? '最初の写真へ戻る' : label);
    button.querySelector('svg').toggleAttribute('hidden', last);
    button.querySelector('.restart-label').hidden = !last;
  }
}

async function renderPhoto(work, index, token) {
  $('stage').setAttribute('aria-busy', 'true');
  $('photo-error').hidden = true;
  clearTimeout(loadingTimer);
  $('loading-note').hidden = true;
  loadingTimer = setTimeout(() => { if (token === renderToken) $('loading-note').hidden = false; }, 180);
  try {
    const src = displaySource(work);
    await loadImage(src, 'high');
    if (token !== renderToken) return;
    document.documentElement.style.setProperty('--photo-ratio', String(work.width / work.height));
    mainPhoto.removeAttribute('srcset');
    mainPhoto.removeAttribute('sizes');
    mainPhoto.src = src;
    mainPhoto.alt = work.alt;
    mainPhoto.width = work.width;
    mainPhoto.height = work.height;
    photoButton.hidden = false;
    shownId = work.id;
    const caption = [work.title, work.caption].filter(Boolean).join(' — ');
    $('photo-caption').textContent = caption;
    $('photo-caption').hidden = !caption;
    document.documentElement.style.setProperty('--caption-space', caption ? `${$('photo-caption').getBoundingClientRect().height + 12}px` : '0px');
    $('current-number').textContent = pad(index + 1);
    $('selection-status').textContent = `写真 ${index + 1} / ${works.length}。${work.alt}`;
    if (pendingFocusToken === token && !lightbox.open && !about.open && [document.body, $('main')].includes(document.activeElement)) photoButton.focus({ preventScroll: true });
    preloadNeighbours();
  } catch {
    if (token === renderToken) {
      const needsFocus = document.activeElement === photoButton || document.activeElement === $('main') || (pendingFocusToken === token && document.activeElement === document.body);
      photoButton.hidden = true;
      $('photo-error').hidden = false;
      if (needsFocus) $('photo-retry').focus({ preventScroll: true });
    }
  } finally {
    if (token === renderToken) {
      clearTimeout(loadingTimer);
      $('loading-note').hidden = true;
      $('stage').setAttribute('aria-busy', 'false');
    }
  }
}

function render({ focusAfterLoad = false } = {}) {
  const token = ++renderToken;
  ++detailToken;
  pendingFocusToken = focusAfterLoad ? token : null;
  const isIndex = currentView === 'index';
  $('work-view').hidden = isIndex;
  $('index-view').hidden = !isIndex;
  $('index-toggle').setAttribute('aria-expanded', String(isIndex));
  $('index-toggle-label').textContent = isIndex ? '鑑賞に戻る' : '作品一覧';
  updateControls();
  if (lightbox.open && !isIndex) renderLightbox();
  for (const button of $('index-grid').children) button.setAttribute('aria-current', String(button.dataset.id === works[currentIndex].id));
  if (!isIndex) renderPhoto(works[currentIndex], currentIndex, token);
  else { clearTimeout(loadingTimer); $('loading-note').hidden = true; }
}

function buildIndex() {
  $('index-count').textContent = `${works.length} photographs`;
  $('total-number').textContent = pad(works.length);
  const fragment = document.createDocumentFragment();
  works.forEach((work, index) => {
    const button = document.createElement('button');
    button.className = 'index-item';
    button.dataset.id = work.id;
    button.setAttribute('aria-label', `写真 ${index + 1} を見る。${work.alt}`);
    const wrap = document.createElement('span');
    wrap.className = 'index-image-wrap';
    const image = document.createElement('img');
    image.src = work.thumbnail || work.src;
    if (work.variants?.length) {
      image.srcset = work.variants.map((variant) => `${variant.src} ${variant.width}w`).join(', ');
      image.sizes = '(max-width: 600px) calc((100vw - 64px) / 2), (max-width: 900px) calc((100vw - 140px) / 3), 24vw';
    }
    image.alt = '';
    image.width = work.width;
    image.height = work.height;
    image.loading = 'lazy';
    image.decoding = 'async';
    wrap.append(image);
    const label = document.createElement('span');
    label.className = 'index-item-label';
    label.textContent = pad(index + 1);
    button.append(wrap, label);
    button.addEventListener('click', () => navigate(index, 'work', { focus: true }));
    fragment.append(button);
  });
  $('index-grid').replaceChildren(fragment);
}

function setZoom(value) {
  zoomed = value;
  $('lightbox-stage').classList.toggle('is-zoomed', value);
  $('lightbox-stage').tabIndex = value ? 0 : -1;
  $('zoom-toggle').setAttribute('aria-pressed', String(value));
  $('zoom-toggle').textContent = value ? '全体を見る −' : '細部を見る ＋';
  $('zoom-note').textContent = value ? 'スクロールで細部を見る' : '写真全体を表示';
  if (value && lightbox.open) $('lightbox-stage').focus({ preventScroll: true });
  else {
    $('lightbox-stage').scrollTo(0, 0);
    if (lightbox.open && document.activeElement === $('lightbox-stage')) $('zoom-toggle').focus({ preventScroll: true });
  }
}

async function renderLightbox() {
  const token = ++detailToken;
  const index = currentIndex;
  const work = works[index];
  if (lightboxWorkId !== work.id) setZoom(false);
  $('lightbox-stage').setAttribute('aria-busy', 'true');
  $('zoom-toggle').disabled = true;
  $('zoom-toggle').textContent = '細部を読み込み中';
  try {
    await loadImage(work.src, 'high');
    if (token !== detailToken || !lightbox.open || work.id !== works[currentIndex].id) return;
    const image = $('lightbox-photo');
    image.src = work.src;
    image.alt = work.alt;
    image.style.setProperty('--image-width', `${work.width}px`);
    $('lightbox-count').textContent = `${pad(index + 1)} / ${pad(works.length)}`;
    lightboxWorkId = work.id;
    $('zoom-toggle').disabled = false;
    setZoom(zoomed);
  } catch {
    if (token === detailToken) { $('zoom-note').textContent = '細部の画像を読み込めませんでした'; $('zoom-toggle').textContent = '細部を読み込めません'; }
  } finally {
    if (token === detailToken) $('lightbox-stage').setAttribute('aria-busy', 'false');
  }
}

function openLightbox(event) {
  if (performance.now() < suppressClickUntil || shownId !== works[currentIndex].id) return;
  lastLightboxOpener = event?.currentTarget || photoButton;
  $('lightbox-photo').src = mainPhoto.currentSrc || mainPhoto.src;
  $('lightbox-photo').alt = works[currentIndex].alt;
  $('lightbox-photo').style.setProperty('--image-width', `${works[currentIndex].width}px`);
  lightboxWorkId = works[currentIndex].id;
  $('lightbox-count').textContent = `${pad(currentIndex + 1)} / ${pad(works.length)}`;
  setZoom(false);
  lightbox.showModal();
  renderLightbox();
}

function step(direction) {
  if (currentView !== 'work') return;
  const index = currentIndex + direction;
  if (index < 0 || index >= works.length) return;
  navigate(index);
}

function nextOrRestart() { navigate(currentIndex === works.length - 1 ? 0 : currentIndex + 1); }

function enableSwipe(element, isEnabled) {
  let start = null;
  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !isEnabled()) return;
    if (!event.isPrimary) { start = null; return; }
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    element.setPointerCapture?.(event.pointerId);
  });
  element.addEventListener('pointerup', (event) => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      suppressClickUntil = performance.now() + 400;
      step(dx < 0 ? 1 : -1);
    }
  });
  element.addEventListener('pointercancel', () => { start = null; });
}

enableSwipe(photoButton, () => !lightbox.open && !about.open);
enableSwipe($('lightbox-stage'), () => lightbox.open && !zoomed);
$('index-toggle').addEventListener('click', () => navigate(currentIndex, currentView === 'index' ? 'work' : 'index', { focus: true }));
$('previous').addEventListener('click', () => step(-1));
$('next').addEventListener('click', nextOrRestart);
$('lightbox-previous').addEventListener('click', () => step(-1));
$('lightbox-next').addEventListener('click', nextOrRestart);
photoButton.addEventListener('click', openLightbox);
$('expand-open').addEventListener('click', openLightbox);
$('lightbox-stage').addEventListener('click', (event) => {
  if (performance.now() < suppressClickUntil || $('zoom-toggle').disabled) return;
  const rect = $('lightbox-photo').getBoundingClientRect();
  if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) setZoom(!zoomed);
});
$('zoom-toggle').addEventListener('click', () => setZoom(!zoomed));
$('about-open').addEventListener('click', () => about.showModal());
$('photo-retry').addEventListener('click', () => {
  imageCache.clear();
  $('main').focus({ preventScroll: true });
  render({ focusAfterLoad: true });
});
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
about.addEventListener('click', (event) => {
  if (event.target !== about) return;
  const rect = about.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) about.close();
});
lightbox.addEventListener('close', () => {
  ++detailToken;
  setZoom(false);
  if (currentView === 'work') (lastLightboxOpener || photoButton).focus({ preventScroll: true });
});
document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || about.open || zoomed || currentView !== 'work') return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    step(event.key === 'ArrowRight' ? 1 : -1);
  }
});
function restoreRoute() {
  const route = readRoute();
  if (route.index === currentIndex && route.view === currentView) return;
  if (currentView === 'index') indexScroll = window.scrollY;
  if (lightbox.open) lightbox.close();
  if (about.open) about.close();
  currentIndex = route.index;
  currentView = route.view;
  render({ focusAfterLoad: currentView === 'work' });
  requestAnimationFrame(focusView);
}
window.addEventListener('popstate', restoreRoute);
window.addEventListener('hashchange', restoreRoute);
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  $('main').focus({ preventScroll: true });
  $('main').scrollIntoView({ block: 'start' });
});
let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (currentView === 'work' && shownId) render(); }, 160);
}).observe($('stage'));

document.title = `${artist.name} — Photography`;
document.querySelector('.wordmark-name').textContent = artist.name;
document.querySelector('.wordmark-sub').textContent = artist.designation;
document.querySelector('.wordmark').setAttribute('aria-label', `${artist.name}・最初の作品へ`);
document.querySelector('#work-view h1').textContent = `${artist.name}の写真`;
$('about-title').firstChild.nodeValue = artist.name;
$('about-title').querySelector('span').textContent = artist.designation;
$('artist-description').textContent = artist.description || '';
$('artist-description').hidden = !artist.description;
$('artist-statement').textContent = artist.statement || '';
$('artist-statement').hidden = !artist.statement;
$('copyright-name').textContent = artist.name;
$('lightbox-artist').textContent = artist.name;
for (const link of document.querySelectorAll('.instagram-link')) link.href = artist.instagram;
$('instagram-handle').textContent = `@${new URL(artist.instagram).pathname.split('/').filter(Boolean).at(-1)} ↗`;
$('copyright-year').textContent = String(new Date().getFullYear());
buildIndex();
const initial = readRoute();
navigate(initial.index, initial.view, { replace: true, force: true });
