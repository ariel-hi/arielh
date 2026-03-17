const isSub = window.location.pathname.includes('/grid16/');
const base = isSub ? '../' : '';

const navHTML = `
    <a href="${base}index.html" data-page="index">Home</a>
    <a href="${base}rufus.html" data-page="rufus">Rufus</a>
    <a href="${base}horizon.html" data-page="horizon">Horizon</a>
    <a href="${base}nebula.html" data-page="nebula">Nebula</a>
    <a href="${base}shooter.html" data-page="shooter">Shooter</a>
    <a href="${base}gems.html" data-page="gems">Gems</a>
    <a href="${base}grid16/" data-page="grid16">Grid16</a>
`;

function initNav(pageId) {
    const nav = document.querySelector('nav');
    if (nav) {
        nav.innerHTML = navHTML;
        setActiveNav(pageId);
    }
}

function setActiveNav(pageId) {
    const links = document.querySelectorAll('nav a');
    links.forEach(link => {
        if (link.dataset.page === pageId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Global scroll effect for all pages
document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('nav');
    if (nav) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                nav.classList.add('scrolled');
            } else {
                nav.classList.remove('scrolled');
            }
        });
    }
});
