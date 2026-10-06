const navHTML = `<div class="nav-container">
    <a class="nav-wordmark" href="/" aria-label="Ariel Hirschberg, home">ah<span>.</span></a>
    <div class="nav-links"><a href="/projects.html" data-page="projects" data-atlas-open>Index</a><a href="/about.html" data-page="about">About</a></div>
</div>`;
function initNav(pageId) {
    const nav = document.querySelector('nav');
    if (!nav) return;
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = navHTML;
    setActiveNav(pageId);
    if (!document.querySelector('script[data-site-analytics]')) {
        const analytics = document.createElement('script');
        analytics.src = '/analytics/analytics.js?v=20261008';
        analytics.defer = true;
        analytics.dataset.siteAnalytics = 'true';
        document.head.appendChild(analytics);
    }
}
function setActiveNav(pageId) {
    document.querySelectorAll('nav a').forEach(link => {
        const active = link.dataset.page === pageId;
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
}
