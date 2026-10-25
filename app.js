import { artist, collections, works as allWorks } from './data/works.js';

const $ = (id) => document.getElementById(id);
const pad = (number) => String(number).padStart(2, '0');
const lightbox = $('lightbox');
const about = $('about-dialog');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const imageCache = new Map();
const entries = [];
const galleryTemplate = $('gallery').querySelector('.work-entry').cloneNode(true);
const collectionPositions = new Map();
let galleryObserver;
let galleryBuilt = false;
let currentCollection = collections[0].id;
let works = [];
let currentIndex = 0;
let currentView = 'work';
let indexScroll = 0;
let zoomed = false;
let detailToken = 0;
let lightboxWorkId = '';
let lightboxOriginIndex = 0;
let lastLightboxOpener = null;
let ignoredLightboxCloses = 0;
let suppressClickUntil = 0;
let routeLocked = false;
let scrollIdle;
let scrollFrame;
history.scrollRestoration = 'manual';

function collectionById(id) {
  return collections.find((collection) => collection.id === id) || collections[0];
}

function collectionWorks(id) {
  return allWorks.filter((work) => work.collection === id);
}

function rememberCollection() {
  if (!galleryBuilt) return;
  if (currentView === 'index') indexScroll = scrollY;
  collectionPositions.set(currentCollection, { photoId: works[currentIndex]?.id || null, indexScroll });
}

function readRoute() {
  const params = new URLSearchParams(location.hash.slice(1));
  const anchorId = location.hash.startsWith('#work-') ? location.hash.slice(6) : null;
  const photo = allWorks.find((work) => work.id === (params.get('photo') || anchorId));
  // A recognized photograph wins over a conflicting collection, preserving old shared links.
  const collection = collectionById(photo?.collection || params.get('collection')).id;
  const index = collectionWorks(collection).findIndex((work) => work.id === photo?.id);
  return { collection, index: Math.max(0, index), view: params.get('view') === 'index' ? 'index' : 'work' };
}

function writeRoute(replace = false) {
  const params = new URLSearchParams({ collection: currentCollection });
  if (works[currentIndex]) params.set('photo', works[currentIndex].id);
  if (currentView === 'index') params.set('view', 'index');
  const hash = `#${params}`;
  if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash);
}

function updateCollectionUI() {
  const collection = collectionById(currentCollection);
  document.documentElement.dataset.collection = collection.id;
  document.querySelector('meta[name="theme-color"]').content = collection.id === 'mono' ? '#191919' : '#f1f0ec';
  document.title = `${artist.name} — ${collection.name} Photography`;
  document.querySelector('#work-view h1').textContent = `${artist.name}の${collection.label}写真`;
  if ($('collection-label')) $('collection-label').textContent = collection.name;
  for (const button of document.querySelectorAll('#collection-switch button[data-collection]')) {
    const target = collections.find((item) => item.id === button.dataset.collection);
    if (!target) { button.disabled = true; continue; }
    const count = collectionWorks(target.id).length;
    button.setAttribute('aria-pressed', String(target.id === currentCollection));
    button.setAttribute('aria-label', `${target.label}、${count}点の作品`);
    const countLabel = button.querySelector('[data-collection-count]');
    if (countLabel) countLabel.textContent = pad(count);
  }
  const instagram = collection.instagram || artist.instagram;
  for (const link of document.querySelectorAll('.instagram-link')) link.href = instagram;
  $('instagram-handle').textContent = `@${new URL(instagram).pathname.split('/').filter(Boolean).at(-1)} ↗`;
  const first = works[0];
  $('back-to-start').href = first ? `#collection=${collection.id}&photo=${first.id}` : `#collection=${collection.id}`;
}

function setCollection(id, index = 0) {
  const changed = !galleryBuilt || id !== currentCollection;
  if (changed) {
    // Removing snap during replacement prevents the browser from selecting an old frame.
    document.documentElement.classList.remove('is-work-view');
    routeLocked = true;
    clearTimeout(scrollIdle);
    currentCollection = collectionById(id).id;
    works = collectionWorks(currentCollection);
    indexScroll = collectionPositions.get(currentCollection)?.indexScroll || 0;
  }
  currentIndex = Math.max(0, Math.min(works.length - 1, index));
  if (changed) {
    buildGallery();
    buildIndex();
    galleryBuilt = true;
  }
  updateCollectionUI();
}

function closeDialogsForNavigation() {
  ++detailToken;
  if (lightbox.open) { ++ignoredLightboxCloses; lightbox.close(); }
  if (about.open) about.close();
  setZoom(false);
  lightboxWorkId = '';
  lastLightboxOpener = null;
  swipeStart = null;
}

function positionCurrentView({ focus = false, behavior = 'auto' } = {}) {
  if (currentView === 'index' || !works.length) {
    routeLocked = false;
    clearTimeout(scrollIdle);
    window.scrollTo(0, currentView === 'index' ? indexScroll : 0);
    if (focus) {
      if (works.length && currentView === 'index') focusIndexWork();
      else $('main').focus({ preventScroll: true });
    }
  } else scrollToWork(currentIndex, { focus, behavior });
}

function switchCollection(id) {
  if (!collections.some((collection) => collection.id === id) || id === currentCollection) return;
  syncActiveWork();
  rememberCollection();
  closeDialogsForNavigation();
  const saved = collectionPositions.get(id);
  const index = collectionWorks(id).findIndex((work) => work.id === saved?.photoId);
  setCollection(id, Math.max(0, index));
  renderView();
  writeRoute();
  positionCurrentView();
  rememberCollection();
  if ($('selection-status')) $('selection-status').textContent = `${collectionById(id).label}、${works.length}点の作品に切り替えました。`;
}

function updateSelection() {
  for (const button of $('index-grid').children) button.setAttribute('aria-current', String(button.dataset.id === works[currentIndex]?.id));
  const last = !works.length || currentIndex === works.length - 1;
  $('lightbox-previous').disabled = !works.length || currentIndex === 0;
  $('lightbox-next').disabled = !works.length;
  $('lightbox-next').setAttribute('aria-label', last ? '最初の写真へ戻る' : '拡大表示で次の写真');
  $('lightbox-next').querySelector('svg').toggleAttribute('hidden', last);
  $('lightbox-next').querySelector('.restart-label').hidden = !last;
}

function syncActiveWork() {
  if (!entries.length || currentView !== 'work' || lightbox.open || about.open || routeLocked) return;
  let nearest = 0;
  let distance = Infinity;
  entries.forEach(({ figure }, index) => {
    const bounds = figure.getBoundingClientRect();
    const nextDistance = Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2);
    if (nextDistance < distance) { distance = nextDistance; nearest = index; }
  });
  if (nearest !== currentIndex) {
    currentIndex = nearest;
    updateSelection();
    writeRoute(true);
    rememberCollection();
  }
}

function unlockRoute() {
  routeLocked = false;
  syncActiveWork();
}

function scrollToWork(index, { behavior = 'auto', focus = false } = {}) {
  if (!entries[index]) {
    routeLocked = false;
    clearTimeout(scrollIdle);
    window.scrollTo(0, 0);
    if (focus) $('main').focus({ preventScroll: true });
    return;
  }
  routeLocked = true;
  clearTimeout(scrollIdle);
  scrollIdle = setTimeout(unlockRoute, 900);
  const entry = entries[index];
  const top = index === 0 ? 0 : entry.article.getBoundingClientRect().top + scrollY;
  // A destination selected from the index is immediately visible, even before reveal callbacks run.
  entry.entered = true;
  (entry.figure.getAnimations?.() || []).forEach((animation) => animation.cancel());
  window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion.matches ? 'auto' : behavior });
  if (focus) entry.button.focus({ preventScroll: true });
}

function focusIndexWork() {
  const work = works[currentIndex];
  if (!work) return;
  const button = $('index-grid').querySelector(`[data-id="${work.id}"]`);
  button?.focus({ preventScroll: true });
  if (button) {
    const bounds = button.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > innerHeight) button.scrollIntoView({ block: 'nearest' });
  }
}

function updateSnapMode() {
  const enabled = works.length > 0 && currentView === 'work' && !lightbox.open && !about.open;
  document.documentElement.classList.toggle('is-work-view', enabled);
}

function renderView() {
  const isIndex = currentView === 'index';
  $('work-view').hidden = isIndex;
  $('index-view').hidden = !isIndex;
  $('index-toggle').setAttribute('aria-expanded', String(isIndex));
  $('index-toggle-label').textContent = isIndex ? '鑑賞に戻る' : '作品一覧';
  $('gallery').hidden = !works.length;
  $('gallery-end').hidden = !works.length;
  if ($('collection-empty')) $('collection-empty').hidden = works.length > 0;
  updateSnapMode();
  updateSelection();
}

function navigate(index, view = currentView, { replace = false, focus = false, behavior = 'auto' } = {}) {
  if (currentView === 'index') indexScroll = scrollY;
  currentIndex = Math.max(0, Math.min(works.length - 1, index));
  currentView = view;
  writeRoute(replace);
  renderView();
  if (lightbox.open) { renderLightbox(); return; }
  positionCurrentView({ focus, behavior });
  rememberCollection();
}

function configureImage(image, work, { first = false, index = false } = {}) {
  image.alt = index ? '' : work.alt;
  image.width = work.width;
  image.height = work.height;
  image.loading = first ? 'eager' : 'lazy';
  image.decoding = 'async';
  image.fetchPriority = first ? 'high' : 'auto';
  image.sizes = index
    ? '(max-width: 600px) calc((100vw - 64px) / 2), (max-width: 900px) calc((100vw - 140px) / 3), 24vw'
    : `(max-width: 600px) min(calc(100vw - 40px), calc((100svh - ${first ? 288 : 232}px) * ${work.width / work.height})), min(calc(100vw - 144px), calc((100svh - ${first ? 288 : 232}px) * ${work.width / work.height}))`;
  image.srcset = work.variants.map((variant) => `${variant.src} ${variant.width}w`).join(', ');
  image.src = index ? work.thumbnail : work.variants[1].src;
}

function revealEntry(entry) {
  if (!entry || !entry.article.isConnected || entry.entered || currentView !== 'work') return;
  if (!entry.image.complete || !entry.image.naturalWidth) return;
  const bounds = entry.figure.getBoundingClientRect();
  if (bounds.top >= innerHeight || bounds.bottom <= 0) return;
  entry.entered = true;
  if (entry.index === 0 || reducedMotion.matches || typeof entry.figure.animate !== 'function') return;
  // No hidden CSS state: unsupported or interrupted animation always leaves the photograph visible.
  entry.figure.animate([
    { opacity: 0, transform: 'translateY(16px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
}

function buildGallery() {
  galleryObserver?.disconnect();
  entries.forEach(({ figure }) => (figure.getAnimations?.() || []).forEach((animation) => animation.cancel()));
  entries.length = 0;
  const fragment = document.createDocumentFragment();
  works.forEach((work, index) => {
    const article = galleryTemplate.cloneNode(true);
    article.id = `work-${work.id}`;
    article.dataset.id = work.id;
    article.classList.toggle('is-first', index === 0);
    article.classList.toggle('is-portrait', work.height > work.width);
    article.style.setProperty('--work-ratio', String(work.width / work.height));
    if (index > 0) article.querySelector('.scroll-cue')?.remove();
    const figure = article.querySelector('.work-figure');
    const button = article.querySelector('.gallery-photo');
    const image = article.querySelector('.work-image');
    const expand = article.querySelector('.work-expand');
    const error = article.querySelector('.work-error');
    const retry = error.querySelector('button');
    const entry = { article, figure, button, image, index, entered: index === 0 };
    entries.push(entry);
    button.setAttribute('aria-label', `写真 ${index + 1} を大きく見る。${work.alt}`);
    expand.setAttribute('aria-label', `写真 ${index + 1} を大きく見る`);
    article.querySelector('.work-number').textContent = `${pad(index + 1)} / ${pad(works.length)}`;
    const caption = [work.title, work.caption].filter(Boolean).join(' — ');
    article.querySelector('.work-caption').textContent = caption;
    article.querySelector('.work-caption').hidden = !caption;
    image.addEventListener('load', () => {
      const restoreFocus = document.activeElement === retry;
      article.classList.remove('has-error');
      error.hidden = true;
      article.setAttribute('aria-busy', 'false');
      revealEntry(entry);
      if (restoreFocus) button.focus({ preventScroll: true });
    });
    image.addEventListener('error', () => {
      article.classList.add('has-error');
      error.hidden = false;
      article.setAttribute('aria-busy', 'false');
      if (document.activeElement === button) retry.focus({ preventScroll: true });
    });
    retry.addEventListener('click', () => {
      article.setAttribute('aria-busy', 'true');
      image.srcset = '';
      image.src = work.src;
      if (image.complete && image.naturalWidth) image.decode().then(() => {
        article.classList.remove('has-error'); error.hidden = true; article.setAttribute('aria-busy', 'false'); button.focus({ preventScroll: true });
      }).catch(() => {});
    });
    button.addEventListener('click', (event) => openLightbox(index, event.currentTarget));
    expand.addEventListener('click', (event) => openLightbox(index, event.currentTarget));
    article.addEventListener('focusin', () => {
      entry.entered = true;
      (figure.getAnimations?.() || []).forEach((animation) => animation.cancel());
    });
    configureImage(image, work, { first: index === 0 });
    if (index === currentIndex) { image.loading = 'eager'; image.fetchPriority = 'high'; }
    fragment.append(article);
    if (image.complete && image.naturalWidth) article.setAttribute('aria-busy', 'false');
  });
  $('gallery').replaceChildren(fragment);
  if (works.length > 1) {
    const cue = entries[0].article.querySelector('.scroll-cue');
    cue.href = `#work-${works[1].id}`;
    cue.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(1, 'work', { focus: true, behavior: 'smooth' });
    });
  } else entries[0]?.article.querySelector('.scroll-cue')?.remove();
  if ('IntersectionObserver' in window) {
    galleryObserver = new IntersectionObserver((observations) => {
      for (const observation of observations) if (observation.isIntersecting) revealEntry(entries.find((entry) => entry.figure === observation.target));
    }, { threshold: 0.12 });
    entries.forEach((entry) => galleryObserver.observe(entry.figure));
  }
}

function buildIndex() {
  $('index-count').textContent = `${collectionById(currentCollection).name} / ${works.length} photographs`;
  const fragment = document.createDocumentFragment();
  works.forEach((work, index) => {
    const button = document.createElement('button');
    button.className = 'index-item';
    button.dataset.id = work.id;
    button.setAttribute('aria-label', `写真 ${index + 1} を見る。${work.alt}`);
    const wrap = document.createElement('span');
    wrap.className = 'index-image-wrap';
    const image = document.createElement('img');
    configureImage(image, work, { index: true });
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

function loadImage(src) {
  if (imageCache.has(src)) {
    const cached = imageCache.get(src);
    imageCache.delete(src);
    imageCache.set(src, cached);
    return cached;
  }
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.onload = async () => { try { await image.decode(); } catch {} resolve(image); };
    image.onerror = () => {
      if (imageCache.get(src) === promise) imageCache.delete(src);
      reject(new Error(`Image unavailable: ${src}`));
    };
    image.src = src;
  });
  imageCache.set(src, promise);
  // A viewing session should not retain decoded detail images for the entire archive.
  while (imageCache.size > 4) imageCache.delete(imageCache.keys().next().value);
  return promise;
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
  if (!work || !entries[index]) return;
  const retryFocused = document.activeElement === $('lightbox-retry') || (document.activeElement === $('zoom-toggle') && $('zoom-toggle').dataset.retry);
  if (retryFocused) $('lightbox-stage').focus({ preventScroll: true });
  if (lightboxWorkId !== work.id) setZoom(false);
  const image = $('lightbox-photo');
  const fallback = entries[index].image;
  const hasFallback = fallback.complete && fallback.naturalWidth > 0;
  image.hidden = !hasFallback;
  if (hasFallback) image.src = fallback.currentSrc || fallback.src;
  image.alt = work.alt;
  image.style.setProperty('--image-width', `${work.width}px`);
  $('lightbox-count').textContent = `${pad(index + 1)} / ${pad(works.length)}`;
  $('lightbox-error').hidden = true;
  delete $('zoom-toggle').dataset.retry;
  $('lightbox-stage').setAttribute('aria-busy', 'true');
  $('zoom-toggle').disabled = true;
  $('zoom-toggle').textContent = '細部を読み込み中';
  try {
    await loadImage(work.src);
    if (token !== detailToken || !lightbox.open || work.id !== works[currentIndex]?.id) return;
    image.src = work.src;
    image.hidden = false;
    image.alt = work.alt;
    image.style.setProperty('--image-width', `${work.width}px`);
    $('lightbox-count').textContent = `${pad(index + 1)} / ${pad(works.length)}`;
    lightboxWorkId = work.id;
    $('zoom-toggle').disabled = false;
    setZoom(zoomed);
  } catch {
    if (token === detailToken) {
      $('lightbox-error').hidden = hasFallback;
      $('zoom-note').textContent = '細部の画像を読み込めませんでした';
      $('zoom-toggle').textContent = '細部を再読み込み';
      $('zoom-toggle').dataset.retry = 'true';
      $('zoom-toggle').disabled = false;
      if (retryFocused && document.activeElement === $('lightbox-stage')) (hasFallback ? $('zoom-toggle') : $('lightbox-retry')).focus({ preventScroll: true });
    }
  } finally {
    if (token === detailToken) $('lightbox-stage').setAttribute('aria-busy', 'false');
  }
}

function animateDialog(dialog) {
  if (!reducedMotion.matches && typeof dialog.animate === 'function') dialog.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' });
}

function openLightbox(index, opener) {
  if (!entries[index]?.image.naturalWidth) return;
  currentIndex = index;
  updateSelection();
  writeRoute();
  rememberCollection();
  lastLightboxOpener = opener;
  lightboxOriginIndex = index;
  const work = works[index];
  $('lightbox-photo').src = entries[index].image.currentSrc || work.src;
  $('lightbox-photo').alt = work.alt;
  $('lightbox-photo').style.setProperty('--image-width', `${work.width}px`);
  $('lightbox-count').textContent = `${pad(index + 1)} / ${pad(works.length)}`;
  lightboxWorkId = work.id;
  setZoom(false);
  lightbox.showModal();
  updateSnapMode();
  animateDialog(lightbox);
  renderLightbox();
}

function step(direction) {
  const index = currentIndex + direction;
  if (index < 0 || index >= works.length) return;
  navigate(index, 'work', { behavior: 'smooth', focus: !lightbox.open });
}

let swipeStart;
$('lightbox-stage').addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch' || !event.isPrimary || zoomed) { swipeStart = null; return; }
  swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  event.currentTarget.setPointerCapture?.(event.pointerId);
});
$('lightbox-stage').addEventListener('pointerup', (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { suppressClickUntil = performance.now() + 400; step(dx < 0 ? 1 : -1); }
});
$('lightbox-stage').addEventListener('pointercancel', () => { swipeStart = null; });
$('lightbox-stage').addEventListener('click', (event) => {
  if (performance.now() < suppressClickUntil || $('zoom-toggle').disabled || $('zoom-toggle').dataset.retry) return;
  const bounds = $('lightbox-photo').getBoundingClientRect();
  if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) setZoom(!zoomed);
});
$('zoom-toggle').addEventListener('click', () => $('zoom-toggle').dataset.retry ? renderLightbox() : setZoom(!zoomed));
$('lightbox-retry').addEventListener('click', renderLightbox);
$('lightbox-previous').addEventListener('click', () => step(-1));
$('lightbox-next').addEventListener('click', () => navigate(currentIndex === works.length - 1 ? 0 : currentIndex + 1, 'work'));
for (const button of document.querySelectorAll('#collection-switch button[data-collection]')) {
  button.addEventListener('click', () => switchCollection(button.dataset.collection));
}
$('index-toggle').addEventListener('click', () => navigate(currentIndex, currentView === 'index' ? 'work' : 'index', { focus: true }));
$('end-index').addEventListener('click', () => navigate(currentIndex, 'index', { focus: true }));
$('back-to-start').addEventListener('click', (event) => { event.preventDefault(); navigate(0, 'work', { focus: true, behavior: 'smooth' }); });
document.querySelector('.wordmark').addEventListener('click', (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); navigate(0, 'work', { focus: true, behavior: 'smooth' });
});
$('about-open').addEventListener('click', () => { about.showModal(); updateSnapMode(); animateDialog(about); });
about.addEventListener('close', updateSnapMode);
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
about.addEventListener('click', (event) => {
  if (event.target !== about) return;
  const bounds = about.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) about.close();
});
lightbox.addEventListener('close', () => {
  if (ignoredLightboxCloses) { --ignoredLightboxCloses; return; }
  ++detailToken;
  setZoom(false);
  updateSnapMode();
  if (currentView !== 'work' || !works.length) return;
  scrollToWork(currentIndex, { focus: lightboxOriginIndex !== currentIndex });
  if (lightboxOriginIndex === currentIndex) lastLightboxOpener?.focus({ preventScroll: true });
});
document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || about.open || zoomed || currentView !== 'work') return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); }
});
function restoreRoute() {
  const route = readRoute();
  if (route.collection === currentCollection && route.index === currentIndex && route.view === currentView) return;
  rememberCollection();
  closeDialogsForNavigation();
  setCollection(route.collection, route.index);
  currentView = route.view;
  renderView();
  writeRoute(true);
  positionCurrentView({ focus: true });
  rememberCollection();
  if ($('selection-status')) $('selection-status').textContent = `${collectionById(currentCollection).label}、${works.length}点の作品を表示しています。`;
}
window.addEventListener('popstate', restoreRoute);
window.addEventListener('hashchange', restoreRoute);
// Keep scrolling native across the entire page, including photo buttons.
// CSS Scroll Snap aligns photographs after wheel, touch, and keyboard scrolling.
window.addEventListener('scroll', () => {
  if (routeLocked) { clearTimeout(scrollIdle); scrollIdle = setTimeout(unlockRoute, 120); }
  if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = null; syncActiveWork(); });
}, { passive: true });
let resizeFrame;
window.addEventListener('resize', () => {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    if (currentView === 'work' && !lightbox.open && !about.open && routeLocked) {
      scrollToWork(currentIndex);
      unlockRoute();
    } else syncActiveWork();
  });
});
reducedMotion.addEventListener?.('change', () => { if (reducedMotion.matches) entries.forEach(({ figure }) => (figure.getAnimations?.() || []).forEach((animation) => animation.cancel())); });
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  if (currentView === 'index') focusIndexWork();
  else scrollToWork(currentIndex, { focus: true });
});

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
$('copyright-year').textContent = String(new Date().getFullYear());
const initial = readRoute();
currentView = initial.view;
setCollection(initial.collection, initial.index);
renderView();
writeRoute(true);
requestAnimationFrame(() => { positionCurrentView(); rememberCollection(); });
