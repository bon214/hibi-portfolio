// Keep local previews and other sites out of the production property's reports.
if (location.hostname === 'bon214.github.io' && location.pathname.startsWith('/hibi-portfolio/')) {
  const measurementId = 'G-MW6Z7G6R04';
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', measurementId);

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(tag);
}
