import { artist, works } from './data/works.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
let currentIndex = 0;
let currentView = 'work';
let indexScroll = 0;
let zoomed = false;
let renderToken = 0;
let pointerStart = null;
const mainPhoto = $('main-photo');
const photoButton = $('photo-open');
const lightbox = $('lightbox');
const about = $('about-dialog');
history.scrollRestoration = 'manual';
function focusIndexWork() {
  const button = $('index-grid').querySelector(`[data-id="${works[currentIndex].id}"]`);
  if (!button) return;
  button.focus({ preventScroll: true });
  const bounds = button.getBoundingClientRect();
  if (bounds.top < 0 || bounds.bottom > window.innerHeight) button.scrollIntoView({ block: 'nearest' });
}

function routeFromLocation() {
  const params = new URLSearchParams(location.hash.slice(1));
  const found = works.findIndex((work) => work.id === params.get('photo'));
  return { index: found >= 0 ? found : 0, view: params.get('view') === 'index' ? 'index' : 'work' };
}

function navigate(index, view = currentView, { replace = false, focus = false } = {}) {
  const clamped = Math.max(0, Math.min(works.length - 1, index));
  if (currentView === 'index') indexScroll = window.scrollY;
  currentIndex = clamped;
  currentView = view;
  const params = new URLSearchParams({ photo: works[clamped].id });
  if (view === 'index') params.set('view', 'index');
  const hash = `#${params}`;
  if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash);
  render();
  if (focus) requestAnimationFrame(() => {
    if (view === 'index') {
      window.scrollTo(0, indexScroll);
      focusIndexWork();
    } else {
      window.scrollTo(0, 0);
      photoButton.focus({ preventScroll: true });
    }
  });
}

function render() {
  const work = works[currentIndex];
  const token = ++renderToken;
  const isIndex = currentView === 'index';
  $('work-view').hidden = isIndex;
  $('index-view').hidden = !isIndex;
  $('index-toggle').setAttribute('aria-expanded', String(isIndex));
  $('index-toggle-label').textContent = isIndex ? '鑑賞に戻る' : '作品一覧';
  $('current-number').textContent = pad(currentIndex + 1);
  $('total-number').textContent = pad(works.length);
  $('previous').disabled = currentIndex === 0;
  $('next').disabled = currentIndex === works.length - 1;
  document.documentElement.style.setProperty('--photo-ratio', String(work.width / work.height));
  mainPhoto.alt = work.alt;
  mainPhoto.width = work.width;
  mainPhoto.height = work.height;
  $('photo-error').hidden = true;
  photoButton.classList.add('is-loading');
  const done = () => { if (renderToken === token) photoButton.classList.remove('is-loading'); };
  mainPhoto.onload = done;
  mainPhoto.onerror = () => { done(); if (renderToken === token) $('photo-error').hidden = false; };
  if (mainPhoto.getAttribute('src') !== work.src) mainPhoto.src = work.src;
  if (mainPhoto.complete) { done(); if (!mainPhoto.naturalWidth) $('photo-error').hidden = false; }
  const caption = [work.title, work.caption].filter(Boolean).join(' — ');
  $('photo-caption').textContent = caption;
  $('photo-caption').hidden = !caption;
  $('selection-status').textContent = `写真 ${currentIndex + 1} / ${works.length}。${work.alt}`;
  for (const button of $('index-grid').children) button.setAttribute('aria-current', String(button.dataset.id === work.id));
  if (lightbox.open) renderLightbox();
  if (works[currentIndex + 1]) {
    const preload = new Image();
    preload.src = works[currentIndex + 1].src;
  }
}

function buildIndex() {
  $('index-count').textContent = `${pad(works.length)} PHOTOGRAPHS`;
  const fragment = document.createDocumentFragment();
  works.forEach((work, index) => {
    const button = document.createElement('button');
    button.className = 'index-item';
    button.dataset.id = work.id;
    button.setAttribute('aria-label', `写真 ${index + 1} を見る。${work.alt}`);
    const wrap = document.createElement('span');
    wrap.className = 'index-image-wrap';
    const img = document.createElement('img');
    img.src = work.thumbnail || work.src;
    img.alt = '';
    img.width = work.width;
    img.height = work.height;
    img.loading = 'lazy';
    img.decoding = 'async';
    wrap.append(img);
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
  $('zoom-toggle').setAttribute('aria-pressed', String(value));
  $('zoom-toggle').textContent = value ? '全体を見る −' : '細部を見る ＋';
  $('zoom-note').textContent = value ? 'スクロールして細部を見られます' : '写真全体を表示';
  $('lightbox-stage').tabIndex = value ? 0 : -1;
  if (value && lightbox.open) $('lightbox-stage').focus({ preventScroll: true });
  if (!value && lightbox.open && document.activeElement === $('lightbox-stage')) $('zoom-toggle').focus({ preventScroll: true });
  if (!value) $('lightbox-stage').scrollTo(0, 0);
}

function renderLightbox() {
  const work = works[currentIndex];
  $('lightbox-photo').src = work.src;
  $('lightbox-photo').alt = work.alt;
  $('lightbox-photo').style.setProperty('--image-width', `${work.width}px`);
  $('lightbox-count').textContent = `${pad(currentIndex + 1)} / ${pad(works.length)}`;
  setZoom(false);
}

function openLightbox() {
  renderLightbox();
  lightbox.showModal();
}

function step(direction) {
  if (currentView === 'work') navigate(currentIndex + direction);
}

$('index-toggle').addEventListener('click', () => navigate(currentIndex, currentView === 'index' ? 'work' : 'index', { focus: true }));
$('previous').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
photoButton.addEventListener('click', openLightbox);
$('expand-open').addEventListener('click', openLightbox);
$('lightbox-photo').addEventListener('click', () => setZoom(!zoomed));
$('zoom-toggle').addEventListener('click', () => setZoom(!zoomed));
$('about-open').addEventListener('click', () => about.showModal());
$('photo-retry').addEventListener('click', () => { mainPhoto.src = ''; mainPhoto.src = works[currentIndex].src; });

for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
for (const dialog of [about, lightbox]) {
  dialog.addEventListener('click', (event) => { if (event.target === dialog && dialog === about) {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  } });
}
lightbox.addEventListener('close', () => setZoom(false));
document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || about.open || zoomed) return;
  if (currentView !== 'work') return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); }
});
photoButton.addEventListener('pointerdown', (event) => { if (event.pointerType === 'touch') pointerStart = { x: event.clientX, y: event.clientY }; });
photoButton.addEventListener('pointerup', (event) => {
  if (!pointerStart) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    step(dx < 0 ? 1 : -1);
    const preventClick = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    photoButton.addEventListener('click', preventClick, { once: true, capture: true });
    setTimeout(() => photoButton.removeEventListener('click', preventClick, { capture: true }), 0);
  }
});
photoButton.addEventListener('pointercancel', () => { pointerStart = null; });
function restoreRoute() {
  const route = routeFromLocation();
  if (route.index === currentIndex && route.view === currentView) return;
  if (currentView === 'index') indexScroll = window.scrollY;
  if (lightbox.open) lightbox.close();
  if (about.open) about.close();
  currentIndex = route.index;
  currentView = route.view;
  render();
  requestAnimationFrame(() => {
    if (currentView === 'index') {
      window.scrollTo(0, indexScroll);
      focusIndexWork();
    } else {
      window.scrollTo(0, 0);
      photoButton.focus({ preventScroll: true });
    }
  });
}
window.addEventListener('popstate', restoreRoute);
window.addEventListener('hashchange', restoreRoute);
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  $('main').focus({ preventScroll: true });
  $('main').scrollIntoView({ block: 'start' });
});

document.title = `${artist.name} — Photography`;
document.querySelector('.wordmark-name').firstChild.nodeValue = artist.name;
document.querySelector('.wordmark').setAttribute('aria-label', `${artist.name}・最初の作品へ`);
document.querySelector('.header-description').textContent = artist.designation;
document.querySelector('#work-view h1').textContent = `${artist.name}の写真`;
document.querySelector('.controls-note').textContent = `PHOTOGRAPHS BY ${artist.name}`;
$('about-title').firstChild.nodeValue = artist.name;
$('about-title').querySelector('span').textContent = artist.designation;
$('copyright-name').textContent = artist.name;
$('lightbox-artist').textContent = artist.name;
for (const link of document.querySelectorAll('a[href="https://www.instagram.com/hibigraph116/"]')) link.href = artist.instagram;
document.querySelector('.about-instagram > span:nth-child(2)').textContent = `${new URL(artist.instagram).pathname.replaceAll('/', '@').replace(/@$/, '')} ↗`;
if (artist.statement) { $('artist-statement').textContent = artist.statement; $('artist-statement').hidden = false; }
$('copyright-year').textContent = String(new Date().getFullYear());
buildIndex();
const initial = routeFromLocation();
navigate(initial.index, initial.view, { replace: true });
