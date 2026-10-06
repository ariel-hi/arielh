(() => {
  'use strict';
  if (window.ArielAnalytics || location.protocol !== 'https:'
    || !['arielh.com', 'www.arielh.com'].includes(location.hostname)
    || navigator.doNotTrack === '1' || window.doNotTrack === '1'
    || navigator.globalPrivacyControl === true || navigator.webdriver === true
    || /bot|crawler|spider|headless|lighthouse|pagespeed|monitor|uptime/i.test(navigator.userAgent)) return;

  const paths = new Map([
    ['/', '/'], ['/index.html', '/'], ['/projects.html', '/projects.html'],
    ['/projects/', '/projects.html'], ['/about.html', '/about.html'],
    ['/privacy.html', '/privacy.html'], ['/rufus.html', '/rufus.html'],
    ['/kinetic.html', '/kinetic.html'],
    ['/horizon.html', '/horizon.html'], ['/nebula.html', '/nebula.html'],
    ['/shooter.html', '/shooter.html'],
    ['/grid16/', '/grid16/'], ['/grid16/index.html', '/grid16/'],
    ['/shooter_game/', '/shooter_game/'], ['/shooter_game/index.html', '/shooter_game/'],
  ]);
  // Apache serves 404.html at the missing address, so count misses under one fixed path.
  const path = paths.get(location.pathname) ?? (document.querySelector?.('.not-found') ? '/404.html' : undefined);
  if (!path) return;
  const projects = new Set(['grid16', 'space-shooter', 'star-cluster-blitz', 'horizon', 'nebula', 'rufus', 'word-king', 'who-goes-first', 'copysprig', 'worldbreaker', 'comprehend', 'kinetic']);
  const filters = new Set(['all', 'games', 'tools', 'experiments']);
  const routeProjects = new Map([
    ['/grid16/', 'grid16'], ['/grid16/index.html', 'grid16'],
    ['/shooter.html', 'space-shooter'],
    ['/horizon.html', 'horizon'], ['/nebula.html', 'nebula'], ['/rufus.html', 'rufus'], ['/kinetic.html', 'kinetic'],
  ]);
  const recent = new Map();
  let sentCount = 0;
  let pageViewed = false;

  function referrerHost() {
    try {
      const host = new URL(document.referrer).hostname.toLowerCase();
      return host !== location.hostname && !['arielh.com', 'www.arielh.com'].includes(host)
        && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : '';
    } catch { return ''; }
  }

  function track(event, tag = '') {
    if (sentCount >= 60 || (event === 'page_view' && tag !== '')
      || (event === 'project_open' && !projects.has(tag))
      || (event === 'project_filter' && !filters.has(tag))
      || (event === 'game_start' && !['grid16', 'shooter', 'gems'].includes(tag))
      || !['page_view', 'project_open', 'project_filter', 'game_start'].includes(event)) return;
    const now = performance.now();
    const key = `${event}:${tag}`;
    if (now - (recent.get(key) ?? -Infinity) < 1000) return;
    recent.set(key, now);
    sentCount++;
    const payload = JSON.stringify({
      event, path, tag, referrer: event === 'page_view' ? referrerHost() : '',
      device: matchMedia('(max-width: 767px)').matches ? 'small' : 'large',
    });
    try {
      const queued = navigator.sendBeacon?.('/analytics/collect.php', new Blob([payload], { type: 'text/plain' }));
      if (!queued) fetch('/analytics/collect.php', {
        method: 'POST', credentials: 'omit', keepalive: true,
        headers: { 'Content-Type': 'text/plain' }, body: payload,
      }).catch(() => {});
    } catch { /* Measurement never interrupts the page. */ }
  }

  function pageView() {
    if (pageViewed || document.visibilityState === 'hidden' || window.top !== window) return;
    pageViewed = true;
    track('page_view');
  }
  window.ArielAnalytics = Object.freeze({ track });
  window.dispatchEvent(new Event('ariel-analytics-ready'));
  pageView();
  document.addEventListener('visibilitychange', pageView);
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    const explicit = target.closest('[data-analytics-event]');
    if (explicit) {
      track(explicit.dataset.analyticsEvent, explicit.dataset.analyticsTag || explicit.dataset.project || '');
      return;
    }
    const filter = target.closest('[data-project-filter], [data-filter]');
    if (filter) {
      track('project_filter', filter.dataset.projectFilter || filter.dataset.filter);
      return;
    }
    const link = target.closest('a[href]');
    if (link) {
      let project = link.dataset.project;
      if (!project) {
        try {
          const url = new URL(link.href, location.href);
          if (url.origin === location.origin) project = routeProjects.get(url.pathname);
        } catch { return; }
      }
      if (projects.has(project)) track('project_open', project);
      return;
    }
    const button = target.closest('button');
    if (button && ['start-btn', 'restart-btn', 'play-again-btn'].includes(button.id)) {
      if (path === '/grid16/') track('game_start', 'grid16');
    }
  });
})();
