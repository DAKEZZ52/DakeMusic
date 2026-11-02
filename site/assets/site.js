(() => {
  'use strict';

  /* ---------- 导航 ---------- */
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');

  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const toggleIcon = toggle.querySelector('use');

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', '打开菜单');
    if (toggleIcon) toggleIcon.setAttribute('href', '#i-menu');
  };

  toggle.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    if (toggleIcon) toggleIcon.setAttribute('href', open ? '#i-close' : '#i-menu');
  });

  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeMenu();
  });

  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (!e.target.closest('#nav')) closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) closeMenu();
  });

  /* ---------- 滚动入场 ---------- */
  const revealItems = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    revealItems.forEach((el) => io.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add('in'));
  }

  /* ---------- 截图灯箱 ---------- */
  const dialog = document.getElementById('lightbox');
  const image = document.getElementById('lightboxImage');
  const caption = document.getElementById('lightboxCaption');
  const btnClose = document.getElementById('lightboxClose');
  const btnPrev = document.getElementById('lightboxPrev');
  const btnNext = document.getElementById('lightboxNext');
  const shots = Array.from(document.querySelectorAll('.shot'));

  let current = 0;
  let lastFocus = null;

  const render = (index) => {
    current = (index + shots.length) % shots.length;
    const shot = shots[current];
    const img = shot.querySelector('img');
    image.src = shot.dataset.full;
    image.alt = img ? img.alt : shot.dataset.title;
    caption.textContent = shot.dataset.title;
  };

  const open = (index) => {
    lastFocus = shots[index];
    render(index);
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    document.body.style.overflow = 'hidden';
  };

  const close = () => {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  };

  shots.forEach((shot, index) => {
    shot.addEventListener('click', () => open(index));
  });

  btnClose.addEventListener('click', close);
  btnPrev.addEventListener('click', () => render(current - 1));
  btnNext.addEventListener('click', () => render(current + 1));

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      render(current - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      render(current + 1);
    }
  });

  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';
  });

  /* ---------- 年份 ---------- */
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
