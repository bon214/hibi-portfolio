    // Keep the server-rendered first photograph usable even if the main module fails.
    (() => {
      const entry = document.querySelector('#gallery .work-entry');
      const image = entry.querySelector('.work-image');
      if (image.complete) return;
      entry.setAttribute('aria-busy', 'true');
      const timer = setTimeout(() => { if (entry.isConnected && entry.getAttribute('aria-busy') === 'true') entry.classList.add('is-loading'); }, 180);
      const finish = () => { clearTimeout(timer); entry.classList.remove('is-loading'); entry.setAttribute('aria-busy', 'false'); };
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    })();
