(() => {
  'use strict';
  let pendingStarts = 0;
  function flush() {
    if (!window.ArielAnalytics || pendingStarts === 0) return;
    // Initial load produces one real start. Later restart signals arrive live.
    window.ArielAnalytics.track('game_start', 'shooter');
    pendingStarts = 0;
  }
  window.addEventListener('message', event => {
    const iframe = document.getElementById('game-iframe');
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== location.origin
      || !event.data || event.data.type !== 'ariel-game-start' || event.data.game !== 'shooter') return;
    pendingStarts = Math.min(pendingStarts + 1, 10);
    flush();
  });
  window.addEventListener('ariel-analytics-ready', flush);
})();
