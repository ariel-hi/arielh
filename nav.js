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

// Scroll effect
document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });
});
