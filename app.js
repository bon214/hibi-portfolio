import { artist, collections, works as allWorks } from './data/works.js?v=20261029-input-follow';
import { createWheelGesture, createTouchGesture } from './page-gestures.js?v=20261029-input-follow';
import { advanceSpring, nearestStop, adjacentStop, followPosition } from './scroll-motion.js?v=20261029-input-follow';

const $ = (id) => document.getElementById(id);
const pad = (number) => String(number).padStart(2, '0');
const lightbox = $('lightbox');
const about = $('about-dialog');
const photoPositionNav = $('photo-position-nav');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const imageCache = new Map();
const entries = [];
let entryTops = [];
let measuredHeight = 0;
const galleryTemplate = $('gallery').querySelector('.work-entry').cloneNode(true);
const collectionPositions = new Map();
let galleryObserver;
let galleryBuilt = false;
let currentCollection = collections[0].id;
let works = [];
let currentIndex = 0;
let currentView = 'work';
let indexScroll = 0;
let lightboxLoadToken = 0;
let lightboxOriginIndex = 0;
let lastLightboxOpener = null;
let ignoredLightboxCloses = 0;
let routeLocked = false;
let scrollIdle;
let scrollFrame;
let motionFrame;
let motionTarget = null;
let motionState = null;
let inputSession = null;
let wheelRelease;
const wheelGesture = createWheelGesture();
const touchGesture = createTouchGesture();
history.scrollRestoration = 'manual';

const photoSurfaceSelector = 'img, .gallery-photo, .index-image-wrap, #lightbox-stage';
function preventPhotoSaving(event) {
  if (event.target instanceof Element && event.target.closest(photoSurfaceSelector)) event.preventDefault();
}
// Delegate so collection switches and newly rendered thumbnails remain covered.
document.addEventListener('contextmenu', preventPhotoSaving);
document.addEventListener('dragstart', preventPhotoSaving);

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
    button.setAttribute('aria-label', `${target.name}, ${count} photographs`);
    const countLabel = button.querySelector('[data-collection-count]');
    if (countLabel) countLabel.textContent = pad(count);
  }
  const instagram = collection.instagram || artist.instagram;
  for (const link of document.querySelectorAll('.instagram-link')) link.href = instagram;
  const first = works[0];
  $('back-to-start').href = first ? `#collection=${collection.id}&photo=${first.id}` : `#collection=${collection.id}`;
}

function setCollection(id, index = 0) {
  const changed = !galleryBuilt || id !== currentCollection;
  if (changed) {
    cancelWorkMotion();
    wheelGesture.reset();
    touchGesture.reset();
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
    buildPhotoPositionNavigation();
    galleryBuilt = true;
  }
  updateCollectionUI();
}

function closeDialogsForNavigation() {
  ++lightboxLoadToken;
  if (lightbox.open) { ++ignoredLightboxCloses; lightbox.close(); }
  if (about.open) about.close();
  lastLightboxOpener = null;
  swipeStart = null;
}

function positionCurrentView({ focus = false, behavior = 'auto' } = {}) {
  if (currentView === 'index' || !works.length) {
    cancelWorkMotion();
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
  updatePhotoPositionNavigation();
  const last = !works.length || currentIndex === works.length - 1;
  $('lightbox-previous').disabled = !works.length || currentIndex === 0;
  $('lightbox-next').disabled = !works.length;
  $('lightbox-next').setAttribute('aria-label', last ? '最初の写真へ戻る' : '拡大表示で次の写真');
  $('lightbox-next').querySelector('svg').toggleAttribute('hidden', last);
  $('lightbox-next').querySelector('.restart-label').hidden = !last;
}

function syncActiveWork({ duringMotion = false, route = true } = {}) {
  if (!entries.length || currentView !== 'work' || lightbox.open || about.open || (routeLocked && !duringMotion)) return;
  if (entryTops.length !== entries.length || measuredHeight !== innerHeight) measureWorkPositions();
  let nearest = 0;
  let distance = Infinity;
  const position = scrollY;
  entryTops.forEach((top, index) => {
    const nextDistance = Math.abs(top - position);
    if (nextDistance < distance) { distance = nextDistance; nearest = index; }
  });
  if (nearest !== currentIndex) {
    currentIndex = nearest;
    updateSelection();
  }
  if (route) { writeRoute(true); rememberCollection(); }
}

function measureWorkPositions() {
  // Measure stationary frames only when layout changes, never the animated figures per scroll frame.
  const position = scrollY;
  entryTops = entries.map(({ article }, index) => index === 0 ? 0 : article.getBoundingClientRect().top + position);
  measuredHeight = innerHeight;
}

function unlockRoute() {
  if (motionState || inputSession) return;
  routeLocked = false;
  syncActiveWork();
}

function cancelWorkMotion() {
  if (motionFrame) cancelAnimationFrame(motionFrame);
  motionFrame = null;
  motionTarget = null;
  motionState = null;
  inputSession = null;
  clearTimeout(wheelRelease);
  clearTimeout(scrollIdle);
  routeLocked = false;
  document.documentElement.classList.remove('is-page-moving');
}

function pageStops() {
  if (entryTops.length !== entries.length || measuredHeight !== innerHeight) measureWorkPositions();
  return [...entryTops, Math.max(0, document.documentElement.scrollHeight - innerHeight)];
}

function wakeMotion() {
  document.documentElement.classList.add('is-page-moving');
  routeLocked = true;
  if (motionFrame) return;
  if (motionState) motionState.time = performance.now();
  motionFrame = requestAnimationFrame(tickMotion);
}

function tickMotion(now) {
  motionFrame = null;
  const state = motionState;
  if (!state) return;
  if (state.kind !== 'direct') {
    const next = advanceSpring(state.position, state.velocity, state.target, (now - state.time) / 1000, state.kind === 'follow' ? 42 : 22);
    state.position = next.position;
    state.velocity = next.velocity;
  } else state.position = state.target;
  state.time = now;
  const bounds = inputSession?.bounds || [0, Math.max(0, document.documentElement.scrollHeight - innerHeight)];
  const bounded = Math.max(bounds[0], Math.min(bounds[1], state.position));
  if (bounded !== state.position) state.velocity = 0;
  state.position = bounded;
  window.scrollTo({ top: state.position, behavior: 'instant' });
  if (inputSession) syncActiveWork({ duringMotion: true, route: false });
  const resting = Math.abs(state.target - state.position) < 0.35 && Math.abs(state.velocity) < 5;
  if (state.kind === 'direct' || resting) {
    if (state.kind === 'settle') {
      window.scrollTo({ top: state.target, behavior: 'instant' });
      motionState = null;
      motionTarget = null;
      routeLocked = false;
      document.documentElement.classList.remove('is-page-moving');
      syncActiveWork();
    }
    // A held gesture stays in follow mode even if it has no new input for several frames.
    return;
  }
  motionFrame = requestAnimationFrame(tickMotion);
}

function moveToPosition(top, stop, behavior) {
  const destination = Math.max(0, Math.min(top, document.documentElement.scrollHeight - innerHeight));
  if (reducedMotion.matches || behavior !== 'smooth' || Math.abs(destination - scrollY) < 0.5) {
    cancelWorkMotion();
    window.scrollTo({ top: destination, behavior: 'instant' });
    syncActiveWork();
    return;
  }
  clearTimeout(wheelRelease);
  inputSession = null;
  const distance = destination - scrollY;
  const direction = Math.sign(distance);
  // Carry release velocity toward the stop, capped to keep critically damped settling monotonic.
  const velocity = direction * Math.min(Math.max(0, (motionState?.velocity || 0) * direction), 22 * Math.abs(distance));
  motionTarget = stop;
  motionState = { kind: 'settle', position: scrollY, velocity, target: destination, time: performance.now() };
  wakeMotion();
}

function scrollToWork(index, { behavior = 'auto', focus = false } = {}) {
  if (!entries[index]) {
    cancelWorkMotion();
    window.scrollTo(0, 0);
    if (focus) $('main').focus({ preventScroll: true });
    return;
  }
  const entry = entries[index];
  if (entryTops.length !== entries.length || measuredHeight !== innerHeight) measureWorkPositions();
  const top = entryTops[index];
  // A destination selected from the index is immediately visible, even before reveal callbacks run.
  entry.entered = true;
  (entry.figure.getAnimations?.() || []).forEach((animation) => animation.cancel());
  moveToPosition(top, index, behavior);
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
  const paging = enabled && (window.visualViewport?.scale || 1) <= 1.01;
  document.documentElement.classList.toggle('is-paged-input', paging);
  if (!paging) { wheelGesture.reset(); touchGesture.reset(); cancelWorkMotion(); syncActiveWork(); }
  photoPositionNav.hidden = !enabled;
}

function pageInputEnabled() {
  return document.documentElement.classList.contains('is-paged-input');
}

function commitStop(stop, behavior = 'smooth') {
  if (stop === entries.length) {
    currentIndex = works.length - 1;
    updateSelection();
    writeRoute(true);
    rememberCollection();
    moveToPosition(pageStops()[stop], stop, behavior);
  } else navigate(stop, 'work', { behavior });
}

function beginFollow(kind, direction = 0) {
  const stops = pageStops();
  const anchor = motionTarget ?? nearestStop(stops, scrollY);
  const candidate = adjacentStop(stops, anchor, direction);
  if (kind === 'wheel' && candidate === anchor) return null;
  const start = scrollY;
  cancelWorkMotion();
  const session = {
    kind, stops, anchor, candidate, start, offset: 0, dragged: false,
    bounds: [Math.min(start, stops[adjacentStop(stops, anchor, -1)]), Math.max(start, stops[adjacentStop(stops, anchor, 1)])],
    samplePosition: start, sampleTime: performance.now(),
  };
  inputSession = session;
  motionTarget = candidate;
  routeLocked = true;
  document.documentElement.classList.add('is-page-moving');
  for (const index of [anchor - 1, anchor, anchor + 1]) {
    const entry = entries[index];
    if (entry) { entry.entered = true; (entry.figure.getAnimations?.() || []).forEach((animation) => animation.cancel()); }
  }
  return session;
}

function followInput(session, offset, direct = false) {
  if (inputSession !== session) return;
  session.offset = offset;
  const target = followPosition(session.stops, session.anchor, session.start, offset);
  const now = performance.now();
  let velocity = motionState?.velocity || 0;
  direct = direct || reducedMotion.matches;
  if (direct && Math.abs(target - session.samplePosition) >= 0.25) {
    velocity = Math.max(-innerHeight * 6, Math.min(innerHeight * 6, (target - session.samplePosition) / Math.max(0.008, (now - session.sampleTime) / 1000)));
    session.samplePosition = target;
    session.sampleTime = now;
  }
  motionState = { kind: direct ? 'direct' : 'follow', position: motionState?.position ?? scrollY, velocity, target, time: motionState?.time ?? now };
  wakeMotion();
}

function finishFollow(session, direction) {
  if (inputSession !== session) return;
  clearTimeout(wheelRelease);
  if (motionState?.kind === 'direct') {
    // Flush the last finger position before using its velocity for the release motion.
    window.scrollTo({ top: motionState.target, behavior: 'instant' });
    motionState.position = motionState.target;
    if (performance.now() - session.sampleTime > 80) motionState.velocity = 0;
  }
  inputSession = null;
  commitStop(adjacentStop(session.stops, session.anchor, direction));
}

function armWheelRelease(session) {
  clearTimeout(wheelRelease);
  wheelRelease = setTimeout(() => {
    if (inputSession === session && pageInputEnabled()) finishFollow(session, Math.sign(session.candidate - session.anchor));
  }, 200);
}

window.addEventListener('wheel', (event) => {
  if (!pageInputEnabled() || event.defaultPrevented) { wheelGesture.reset(); return; }
  if (!event.cancelable) return;
  const intent = wheelGesture.read(event, performance.now(), innerHeight);
  if (intent.direction) {
    if (!beginFollow('wheel', intent.direction)) return;
    wheelGesture.claim();
  }
  if (intent.direction || intent.consume) {
    event.preventDefault();
    const session = inputSession;
    if (session?.kind === 'wheel') {
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
      followInput(session, session.offset + delta);
      armWheelRelease(session);
    }
  } else if (inputSession?.kind === 'wheel') {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      cancelWorkMotion(); syncActiveWork();
    } else armWheelRelease(inputSession);
  }
}, { passive: false });

const touchPoint = (touch) => ({ id: touch.identifier, x: touch.clientX, y: touch.clientY });
const shell = document.querySelector('.site-shell');
shell.addEventListener('touchstart', (event) => {
  if (!pageInputEnabled() || event.touches.length !== 1) { touchGesture.reset(); cancelWorkMotion(); syncActiveWork(); return; }
  wheelGesture.reset();
  beginFollow('touch');
  touchGesture.start(touchPoint(event.touches[0]));
}, { passive: true });
shell.addEventListener('touchmove', (event) => {
  if (!pageInputEnabled() || event.touches.length !== 1) {
    touchGesture.reset();
    if (inputSession?.kind === 'touch') { cancelWorkMotion(); syncActiveWork(); }
    return;
  }
  const preview = touchGesture.preview(touchPoint(event.touches[0]));
  if (preview?.vertical && inputSession?.kind === 'touch') {
    inputSession.dragged = true;
    followInput(inputSession, preview.offset, true);
  }
}, { passive: true });
shell.addEventListener('touchend', (event) => {
  if (!pageInputEnabled() || event.touches.length || !event.changedTouches.length) {
    touchGesture.reset();
    if (inputSession?.kind === 'touch') { cancelWorkMotion(); syncActiveWork(); }
    return;
  }
  const point = touchPoint(event.changedTouches[0]);
  const preview = touchGesture.preview(point);
  const session = inputSession;
  if (preview?.vertical && session?.kind === 'touch') {
    session.dragged = true;
    followInput(session, preview.offset, true);
  }
  const direction = touchGesture.end(point);
  if (session?.kind === 'touch' && session.dragged) {
    // Suppress only the recognized swipe's compatibility click, keeping taps and pinches native.
    if (event.cancelable) event.preventDefault();
    finishFollow(session, direction);
  } else if (session?.kind === 'touch') {
    cancelWorkMotion(); syncActiveWork();
  }
}, { passive: false });
shell.addEventListener('touchcancel', () => {
  touchGesture.reset();
  const session = inputSession;
  if (session?.kind === 'touch') {
    if (session.dragged && pageInputEnabled()) finishFollow(session, 0);
    else { cancelWorkMotion(); syncActiveWork(); }
  }
}, { passive: true });
window.addEventListener('blur', () => { wheelGesture.reset(); touchGesture.reset(); cancelWorkMotion(); syncActiveWork(); });
window.visualViewport?.addEventListener('resize', updateSnapMode);
window.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse') {
    wheelGesture.reset();
    if (motionState || inputSession) { cancelWorkMotion(); syncActiveWork(); }
  }
}, { passive: true });
window.addEventListener('keydown', (event) => {
  if (!pageInputEnabled() || event.altKey || event.ctrlKey || event.metaKey) return;
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ', 'Home', 'End'].includes(event.key)) {
    wheelGesture.reset();
    if (motionState || inputSession) { cancelWorkMotion(); syncActiveWork(); }
  }
});

function buildPhotoPositionNavigation() {
  photoPositionNav.setAttribute('aria-label', `${collectionById(currentCollection).label}写真の閲覧位置`);
  const fragment = document.createDocumentFragment();
  works.forEach((work, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'photo-position-button';
    button.dataset.id = work.id;
    button.setAttribute('aria-label', `${index + 1}枚目の写真へ移動（全${works.length}枚）`);
    button.title = `${pad(index + 1)} / ${pad(works.length)}`;
    const marker = document.createElement('span');
    marker.className = 'photo-position-marker';
    marker.setAttribute('aria-hidden', 'true');
    button.append(marker);
    button.addEventListener('click', () => selectPhotoPosition(index));
    fragment.append(button);
  });
  $('photo-position-buttons').replaceChildren(fragment);
}

function updatePhotoPositionNavigation() {
  const buttons = [...$('photo-position-buttons').children];
  const focusedWithin = photoPositionNav.contains(document.activeElement);
  buttons.forEach((button, index) => {
    const selected = index === currentIndex;
    button.setAttribute('aria-current', String(selected));
    button.dataset.distance = String(Math.min(2, Math.abs(index - currentIndex)));
    button.tabIndex = selected ? 0 : -1;
  });
  $('photo-position-count').textContent = `${pad(works.length ? currentIndex + 1 : 0)}/${pad(works.length)}`;
  const selected = buttons[currentIndex];
  if (focusedWithin && !photoPositionNav.hidden && selected !== document.activeElement) selected?.focus({ preventScroll: true });
}

function selectPhotoPosition(index) {
  navigate(index, 'work', { behavior: 'smooth' });
  $('photo-position-buttons').children[currentIndex]?.focus({ preventScroll: true });
}

photoPositionNav.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  let index;
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') index = Math.max(0, currentIndex - 1);
  else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') index = Math.min(works.length - 1, currentIndex + 1);
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = works.length - 1;
  else return;
  event.preventDefault();
  event.stopPropagation();
  selectPhotoPosition(index);
});

function renderView() {
  const isIndex = currentView === 'index';
  if (!isIndex && $('work-view').hidden) entryTops = [];
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
  image.draggable = false;
  image.alt = index ? '' : work.alt;
  image.width = work.width;
  image.height = work.height;
  image.loading = first ? 'eager' : 'lazy';
  image.decoding = 'async';
  image.fetchPriority = first ? 'high' : 'auto';
  const heightBound = `calc((100svh - ${first ? 288 : 232}px) * ${work.width / work.height})`;
  image.sizes = index
    ? '(max-width: 600px) calc((100vw - 64px) / 2), (max-width: 900px) calc((100vw - 140px) / 3), 24vw'
    : `(max-width: 600px) min(calc(100vw - 84px), ${heightBound}), (max-width: 900px) min(calc(100vw - 107px), ${heightBound}), (min-width: 1600px) min(1180px, calc(100vw - 135px), ${heightBound}), min(1180px, calc(100vw - 119px), ${heightBound})`;
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
  entryTops = [];
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
  // A viewing session should not retain decoded full-size images for the entire archive.
  while (imageCache.size > 4) imageCache.delete(imageCache.keys().next().value);
  return promise;
}

async function renderLightbox() {
  const token = ++lightboxLoadToken;
  const index = currentIndex;
  const work = works[index];
  if (!work || !entries[index]) return;
  const retryFocused = document.activeElement === $('lightbox-retry');
  if (retryFocused) $('lightbox-stage').focus({ preventScroll: true });
  const image = $('lightbox-photo');
  const fallback = entries[index].image;
  const hasFallback = fallback.complete && fallback.naturalWidth > 0;
  image.hidden = !hasFallback;
  if (hasFallback) image.src = fallback.currentSrc || fallback.src;
  image.alt = work.alt;
  $('lightbox-count').textContent = `${pad(index + 1)} / ${pad(works.length)}`;
  $('lightbox-error').hidden = true;
  $('lightbox-stage').setAttribute('aria-busy', 'true');
  try {
    await loadImage(work.src);
    if (token !== lightboxLoadToken || !lightbox.open || work.id !== works[currentIndex]?.id) return;
    image.src = work.src;
    image.hidden = false;
    image.alt = work.alt;
    $('lightbox-count').textContent = `${pad(index + 1)} / ${pad(works.length)}`;
  } catch {
    if (token === lightboxLoadToken && lightbox.open) $('lightbox-error').hidden = false;
  } finally {
    if (token === lightboxLoadToken) {
      $('lightbox-stage').setAttribute('aria-busy', 'false');
      if (retryFocused && lightbox.open && document.activeElement === $('lightbox-stage')) {
        ($('lightbox-error').hidden ? lightbox.querySelector('[data-close]') : $('lightbox-retry')).focus({ preventScroll: true });
      }
    }
  }
}

function animateDialog(dialog) {
  if (!reducedMotion.matches && typeof dialog.animate === 'function') dialog.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' });
}

function openLightbox(index, opener) {
  if (!entries[index]?.image.naturalWidth) return;
  cancelWorkMotion();
  currentIndex = index;
  updateSelection();
  writeRoute();
  rememberCollection();
  lastLightboxOpener = opener;
  lightboxOriginIndex = index;
  const work = works[index];
  $('lightbox-photo').src = entries[index].image.currentSrc || work.src;
  $('lightbox-photo').alt = work.alt;
  $('lightbox-count').textContent = `${pad(index + 1)} / ${pad(works.length)}`;
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
  if (event.pointerType !== 'touch' || !event.isPrimary) { swipeStart = null; return; }
  swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  event.currentTarget.setPointerCapture?.(event.pointerId);
});
$('lightbox-stage').addEventListener('pointerup', (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
});
$('lightbox-stage').addEventListener('pointercancel', () => { swipeStart = null; });
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
$('about-open').addEventListener('click', () => {
  cancelWorkMotion();
  syncActiveWork();
  if (currentView === 'work') scrollToWork(currentIndex);
  about.showModal(); about.scrollTop = 0; updateSnapMode(); animateDialog(about);
});
about.addEventListener('close', updateSnapMode);
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
about.addEventListener('click', (event) => {
  if (event.target !== about) return;
  const bounds = about.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) about.close();
});
lightbox.addEventListener('close', () => {
  if (ignoredLightboxCloses) { --ignoredLightboxCloses; return; }
  ++lightboxLoadToken;
  updateSnapMode();
  if (currentView !== 'work' || !works.length) return;
  scrollToWork(currentIndex, { focus: lightboxOriginIndex !== currentIndex });
  if (lightboxOriginIndex === currentIndex) lastLightboxOpener?.focus({ preventScroll: true });
});
document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || about.open || currentView !== 'work') return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); }
});
function restoreRoute() {
  const route = readRoute();
  const interrupted = Boolean(motionState || inputSession);
  if (route.collection === currentCollection && route.index === currentIndex && route.view === currentView && !interrupted) return;
  if (interrupted) cancelWorkMotion();
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
// Native keyboard and scrollbar movement still update the active photograph.
window.addEventListener('scroll', () => {
  // A scrollbar, focus change, or browser action can move independently of our last rendered frame.
  const expected = motionState?.position ?? inputSession?.start;
  if (expected !== undefined && Math.abs(scrollY - expected) > 2) cancelWorkMotion();
  if (routeLocked && !motionState && !inputSession) { clearTimeout(scrollIdle); scrollIdle = setTimeout(unlockRoute, 120); }
  if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = null; syncActiveWork(); });
}, { passive: true });
let resizeFrame;
window.addEventListener('resize', () => {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    if (currentView === 'work') measureWorkPositions();
    if (inputSession) {
      const session = inputSession;
      const stops = pageStops();
      session.start += stops[session.anchor] - session.stops[session.anchor];
      session.stops = stops;
      session.bounds = [Math.min(session.start, stops[adjacentStop(stops, session.anchor, -1)]), Math.max(session.start, stops[adjacentStop(stops, session.anchor, 1)])];
      followInput(session, session.offset, session.kind === 'touch');
      return;
    }
    if (motionState) {
      const stop = motionTarget;
      moveToPosition(pageStops()[stop], stop, 'smooth');
      return;
    }
    if (currentView === 'work' && !lightbox.open && !about.open && routeLocked) {
      scrollToWork(currentIndex);
      unlockRoute();
    } else syncActiveWork();
  });
});
reducedMotion.addEventListener?.('change', () => {
  if (reducedMotion.matches) {
    entries.forEach(({ figure }) => (figure.getAnimations?.() || []).forEach((animation) => animation.cancel()));
    if (motionState && !inputSession) {
      const stop = motionTarget;
      if (stop === entries.length) moveToPosition(document.documentElement.scrollHeight - innerHeight, stop, 'auto');
      else scrollToWork(currentIndex);
    }
  }
});
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
$('artist-viewing-note').textContent = artist.viewingNote;
$('artist-portrait').src = artist.portrait.src;
$('artist-portrait').alt = artist.portrait.alt;
$('artist-portrait').width = artist.portrait.width;
$('artist-portrait').height = artist.portrait.height;
$('artist-essay').href = artist.essay.href;
$('artist-essay').firstChild.nodeValue = `${artist.essay.label} `;
function artistLink(label, href, className = '') {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = className;
  link.setAttribute('aria-label', `${label}（新しいタブで開く）`);
  const arrow = document.createElement('span');
  arrow.textContent = '↗';
  arrow.setAttribute('aria-hidden', 'true');
  link.append(label, arrow);
  return link;
}
$('artist-activities').replaceChildren(...artist.activities.map((activity) => {
  const item = document.createElement('li');
  const label = document.createElement('p');
  label.className = 'about-activity-label';
  label.textContent = activity.label;
  const details = document.createElement('div');
  const description = document.createElement('p');
  description.className = 'about-activity-description';
  description.textContent = activity.description;
  details.append(artistLink(activity.title, activity.href, 'about-activity-title'), description);
  item.append(label, details);
  return item;
}));
$('artist-links').replaceChildren(...artist.links.map((link) => artistLink(link.label, link.href)));
$('copyright-name').textContent = artist.name;
$('lightbox-artist').textContent = artist.name;
$('copyright-year').textContent = String(new Date().getFullYear());
const initial = readRoute();
currentView = initial.view;
setCollection(initial.collection, initial.index);
renderView();
writeRoute(true);
requestAnimationFrame(() => { positionCurrentView(); rememberCollection(); });
