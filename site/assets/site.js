(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 移动端菜单 ---------- */
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('mobile-menu');

  if (toggle && menu) {
    const links = Array.from(menu.querySelectorAll('a'));

    const setOpen = (open) => {
      menu.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      document.body.style.overflow = open ? 'hidden' : '';
      // 链接按阅读顺序依次入场，每项间隔 60ms，总时长不超过 400ms
      links.forEach((link, index) => {
        link.style.transitionDelay = open ? `${Math.min(index * 60, 360)}ms` : '0ms';
      });
    };

    toggle.addEventListener('click', () => setOpen(menu.dataset.open !== 'true'));
    links.forEach((link) => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu.dataset.open === 'true') setOpen(false);
    });
  }

  /* ---------- 滚动显现（每段只播一次） ---------- */
  const revealItems = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-in'));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  }

  /* ---------- 标语：逐字点亮 ---------- */
  const tagline = document.querySelector('[data-tagline]');

  if (tagline) {
    const text = tagline.textContent.trim();
    tagline.textContent = '';

    const words = [];
    // 中文按字切分，英文与数字按词切分，标点跟随前一个字
    const tokens = text.match(/[A-Za-z0-9]+[\s,.]?|[\s]|[^\s]/g) || [];

    tokens.forEach((token) => {
      if (/^\s$/.test(token)) {
        tagline.appendChild(document.createTextNode(' '));
        return;
      }
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = token;
      tagline.appendChild(span);
      words.push(span);
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      words.forEach((word) => word.classList.add('is-on'));
    } else {
      let activated = 0;

      const wordObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-on');
            wordObserver.unobserve(entry.target);
            activated += 1;
          });
        },
        { rootMargin: '0px 0px -35% 0px', threshold: 0 },
      );

      words.forEach((word) => wordObserver.observe(word));

      // 兜底：如果整段已经在视口内但观察器没触发，直接全亮
      requestAnimationFrame(() => {
        if (activated > 0) return;
        const rect = tagline.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          words.forEach((word) => word.classList.add('is-on'));
        }
      });
    }
  }

  /* ---------- FAQ 手风琴 ---------- */
  document.querySelectorAll('.faq-item').forEach((item) => {
    const button = item.querySelector('.faq-q');
    if (!button) return;

    button.addEventListener('click', () => {
      const open = item.dataset.open === 'true';
      // 同一时间只开一个，避免页面被撑得很长
      document.querySelectorAll('.faq-item').forEach((other) => {
        other.dataset.open = 'false';
        const otherButton = other.querySelector('.faq-q');
        if (otherButton) otherButton.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        item.dataset.open = 'true';
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---------- 当前区块高亮 ---------- */
  const sections = Array.from(document.querySelectorAll('section[id]'));
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));

  if (sections.length && navLinks.length && 'IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          navLinks.forEach((link) => {
            const active = link.getAttribute('href') === `#${id}`;
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
          });
        });
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    sections.forEach((section) => sectionObserver.observe(section));
  }
})();
