// Build a readable, indexable project directory without requiring JavaScript.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "projects-data.js"), "utf8"), context);
const projects = context.window.ARIEL_PROJECTS;
const seo = require("./seo.js");
const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const header = (active, prefix = "") => `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <a class="wordmark" href="/" aria-label="Ariel Hirschberg, home">ah<span>.</span></a>
  <nav aria-label="Main navigation" class="site-nav">
    <a href="${prefix}projects.html" data-atlas-open${active === "projects" ? ' aria-current="page"' : ""}>Index</a>
    <a href="${prefix}about.html"${active === "about" ? ' aria-current="page"' : ""}>About</a>
  </nav>
</header>`;
const footer = (prefix = "") => `<footer class="site-footer wrap">
  <span>Ariel Hirschberg <span class="copyright">© <span data-year>2026</span></span></span>
  <a href="${prefix}privacy.html">Privacy</a>
</footer>`;

function page(filename, title, description, body, active, meta = {}) {
  const url = `https://arielh.com/${filename}`;
  // Apache serves this document at the missing URL, including nested paths.
  const prefix = filename === "404.html" ? "/" : "";
  fs.writeFileSync(path.join(root, filename), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} | Ariel Hirschberg</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#0b0b0a">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)} | Ariel Hirschberg">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  ${seo.seoHead({ path: filename, title, fullTitle: `${title} | Ariel Hirschberg`, description, noindex: filename === "404.html", ...meta })}
  <link rel="icon" href="${prefix}favicon.svg?v=20261008" type="image/svg+xml">
  <link rel="stylesheet" href="${prefix}site.css?v=20261008">
  <script defer src="${prefix}site.js?v=20261008"></script>
  <link rel="stylesheet" href="/journey.css?v=20261008">
  <script defer src="/journey.js?v=20261008"></script>
  <script defer src="${prefix}analytics/analytics.js?v=20261008"></script>
</head>
<body>
${header(active, prefix)}
<main id="main" class="site-main wrap" tabindex="-1">
${body}
</main>
${footer(prefix)}
</body>
</html>
`, "utf8");
}

const projectList = projects.map((project) => `  <li class="project-item" data-project-category="${esc(project.category)}">
    <a class="project-link" href="${esc(project.href)}" data-project="${esc(project.id)}">
      <span class="project-name">${esc(project.name)}</span>
      <span class="project-description">${esc(project.description)}</span>
    </a>
    ${project.source ? `<a class="project-source" href="${esc(project.source)}" aria-label="${esc(project.name)} source code">Source</a>` : ""}
  </li>`).join("\n");

page("projects.html", "Projects", "Games, tools, and experiments by Ariel Hirschberg.", `
<p class="eyebrow">Index</p>
<h1>Projects</h1>
<p class="page-intro">Games, small tools, and graphics studies. Some run here in the browser; others live on their own domains.</p>
<div class="project-toolbar">
  <div class="project-filters" data-project-filters role="group" aria-label="Filter projects" hidden>
    <button class="filter-button" type="button" data-filter="all" aria-pressed="true">All</button>
    <button class="filter-button" type="button" data-filter="games" aria-pressed="false">Games</button>
    <button class="filter-button" type="button" data-filter="tools" aria-pressed="false">Tools</button>
    <button class="filter-button" type="button" data-filter="experiments" aria-pressed="false">Experiments</button>
  </div>
  <span class="filter-count" data-project-count role="status" aria-live="polite" aria-atomic="true">${projects.length} projects</span>
</div>
<ul class="project-list" aria-label="Projects">
${projectList}
</ul>`, "projects", { pageType: "CollectionPage", main: {
  "@type": "ItemList",
  numberOfItems: projects.length,
  itemListElement: projects.map((project, index) => ({
    "@type": "ListItem", position: index + 1, name: project.name,
    url: new URL(project.href, seo.ORIGIN + "/").href,
  })),
} });

page("about.html", "About", "Ariel Hirschberg. UC Berkeley, 2020.", `
<section class="about-content" aria-labelledby="about-name">
  <p class="eyebrow">About</p>
  <h1 id="about-name">Ariel<br>Hirschberg<span class="accent">.</span></h1>
  <p class="about-lead">I make games, small tools, and real-time graphics for the web.</p>
  <p>This site collects them: word games, a few arcade pieces, utilities for game night and text, and shader studies like REL, Horizon, and Nebula. Everything here is built by hand with HTML, CSS, JavaScript, and WebGL.</p>
  <dl class="about-facts">
    <div><dt>Education</dt><dd>UC Berkeley, 2020</dd></div>
    <div><dt>Work</dt><dd>${projects.length} projects</dd></div>
    <div><dt>Code</dt><dd><a class="plain-link" href="https://github.com/ariel-hi">github.com/ariel-hi</a></dd></div>
  </dl>
  <div class="page-links"><a class="plain-link" href="projects.html" data-atlas-open>View all projects</a></div>
</section>`, "about", { pageType: "ProfilePage" });

page("privacy.html", "Privacy", "How this site handles statistics, game scores, and browser storage.", `
<article class="privacy-content">
  <h1>Privacy</h1>
  <section aria-labelledby="statistics-heading">
    <h2 id="statistics-heading">Statistics</h2>
    <p>When enabled, first-party analytics counts page views, project opens, game starts, and filter selections. It keeps daily totals by page, action, screen-width group, and referring domain. Totals older than 180 days are deleted when a visit is counted or Stats is opened. It stores no IP addresses, visitor identifiers, visitor cookies, entered text, query strings, or full referring URLs.</p>
    <p>Do Not Track and Global Privacy Control prevent analytics events. The private dashboard uses a secure sign-in cookie and signs out after 30 minutes of inactivity.</p>
  </section>
  <section aria-labelledby="games-heading">
    <h2 id="games-heading">Games and scores</h2>
    <p>Games may save progress and best scores in your browser. If you submit a Grid16 or Space Shooter score, your nickname and score are stored here and may be shown publicly. Each board keeps up to 1,000 high scores. Leaderboards use no IP addresses, fingerprints, or cookies.</p>
  </section>
  <section aria-labelledby="hosting-heading">
    <h2 id="hosting-heading">Hosting and links</h2>
    <p>IONOS hosts this site and processes connection information separately from site analytics. See <a href="https://www.ionos.com/help/data-protection/data-processing-of-website-visitors-of-your-ionos-product/data-processing-by-web-hosting-products/">IONOS hosting data processing</a>. External projects, GitHub, Google Fonts on some game pages, and app stores have their own privacy policies.</p>
  </section>
  <section aria-labelledby="contact-heading">
    <h2 id="contact-heading">Contact</h2>
    <p>Report questions or corrections through <a href="https://github.com/ariel-hi/arielh/issues">GitHub Issues</a>. Keep private details out of public issues.</p>
  </section>
</article>`);

page("404.html", "Page not found", "This page could not be found.", `
<section class="not-found">
  <h1>Page not found</h1>
  <p>The address may be wrong, or the page may have moved.</p>
  <div class="page-links">
    <a class="plain-link" href="/">Home</a>
    <a class="plain-link" href="/projects.html">Projects</a>
  </div>
</section>`);

console.log(`Built ${projects.length}-project directory, About, Privacy, and 404 pages.`);

const order = ['word-king','copysprig','worldbreaker','who-goes-first','comprehend','grid16','space-shooter','horizon','nebula','rufus'];
const scenes = order.map((id, index) => {
  const project = projects.find(p => p.id === id);
  if (!project) throw new Error('Missing showcase project: ' + id);
  const image = id === 'rufus' ? 'images/rufus-04.webp' : `images/project-${id}.webp`;
  const preview = `<img class="scene-image" src="${image}" width="1280" height="720" alt="${esc(project.name)} preview" loading="lazy" decoding="async">`;
  const visual = id === 'copysprig' ? `<picture class="scene-picture"><source media="(max-width: 600px)" srcset="images/project-copysprig-mobile.webp">${preview}</picture>` : preview;
  return `<section class="project-scene" id="${esc(id)}" aria-label="${esc(project.name)}">
  <a class="scene-link" href="${esc(project.href)}" data-project="${esc(id)}">
    <div class="scene-art">${visual}</div>
    <div class="scene-caption"><span class="scene-number"><span class="scene-index">${String(index + 1).padStart(2, '0')}</span> ${esc(project.type)}</span><h2 class="scene-name">${esc(project.name)}</h2><p class="scene-description">${esc(project.description)}</p><span class="scene-destination">${project.href.startsWith('https:') ? 'Visit ' + esc(new URL(project.href).host) : 'Open'}</span></div>
  </a>
</section>`;
}).join('\n');
const homePath = path.join(root, 'index.html');
const home = fs.readFileSync(homePath, 'utf8');
if (!home.includes('<!-- showcase:start -->')) throw new Error('Homepage showcase markers are missing');
fs.writeFileSync(homePath, home.replace(/<!-- showcase:start -->[\s\S]*?<!-- showcase:end -->/, '<!-- showcase:start -->\n' + scenes + '\n<!-- showcase:end -->'));
// One source of truth for the shared project atlas; no runtime data request.
const journeySource = fs.readFileSync(path.join(__dirname, 'journey-runtime.js'), 'utf8');
fs.writeFileSync(path.join(root, 'journey.js'), '/* Generated by build-pages.js */\n' + 'window.ARIEL_ATLAS = ' + JSON.stringify(projects) + ';\n' + journeySource);

// Standalone pages keep their own markup; only the marked SEO block is regenerated.
const byId = Object.fromEntries(projects.map((project) => [project.id, project]));
const img = (src, width, height, alt) => ({ src, width, height, alt });
const work = (id, schemaType, extra = {}) => {
  const project = byId[id];
  return {
    "@type": schemaType, name: project.name, description: project.description,
    url: new URL(project.href, seo.ORIGIN + "/").href, author: { "@id": seo.PERSON_ID },
    creator: { "@id": seo.PERSON_ID }, inLanguage: "en", isAccessibleForFree: true,
    ...(project.source ? { codeRepository: project.source } : {}), ...extra,
  };
};
const game = (id, genre) => work(id, "VideoGame", {
  genre, gamePlatform: "Web browser", applicationCategory: "Game", operatingSystem: "Any",
  playMode: "SinglePlayer", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
});
const rufusPhotos = Array.from({ length: 9 }, (_, i) => img(`images/rufus-0${i + 1}.webp`, 900, 1600, `Rufus photo ${i + 1}`));
const standalone = [
  { path: "", file: "index.html", title: "Ariel Hirschberg", fullTitle: "Ariel Hirschberg", name: "Home",
    description: "Games, tools, and visual experiments by Ariel Hirschberg." },
  { path: "grid16/", file: "grid16/index.html", title: "Grid16", fullTitle: "Grid16 | Ariel Hirschberg",
    description: "Sixteen microgames at once. Survive the grid as the pace picks up.",
    image: img("images/project-grid16.webp", 600, 588, "Grid16 gameplay: a four-by-four grid of microgames"), main: game("grid16", "Arcade") },
  { path: "shooter.html", title: "Space Shooter", fullTitle: "Space Shooter | Ariel Hirschberg",
    description: "Dodge asteroids, collect upgrades, and chase a high score.",
    image: img("images/project-space-shooter.webp", 798, 538, "Space Shooter gameplay"), main: game("space-shooter", "Shooter") },
  { path: "horizon.html", title: "Horizon", fullTitle: "Horizon | Ariel Hirschberg",
    description: "A black hole, an accretion disk, and a little bending of light. An interactive WebGL experiment.",
    image: img("images/project-horizon.webp", 1280, 648, "Horizon: a rendered black hole with a glowing accretion disk"), main: work("horizon", "CreativeWork", { genre: "Interactive WebGL" }) },
  { path: "nebula.html", title: "Nebula", fullTitle: "Nebula | Ariel Hirschberg",
    description: "A slowly shifting cloud of color, made from layers of noise. An interactive WebGL experiment.",
    image: img("images/project-nebula.webp", 1280, 648, "Nebula: layered clouds of color"), main: work("nebula", "CreativeWork", { genre: "Interactive WebGL" }) },
  { path: "kinetic.html", title: "REL", fullTitle: "REL | Ariel Hirschberg",
    description: "Moving, interactive type. A WebGL study by Ariel Hirschberg.", main: work("kinetic", "CreativeWork", { genre: "Interactive WebGL" }) },
  { path: "rufus.html", title: "Rufus", fullTitle: "Rufus | Ariel Hirschberg", description: "Photos of Rufus.", pageType: "ImageGallery",
    image: img("images/rufus-04.webp", 900, 1600, "Rufus, a brown and white bulldog, looking up with his tongue out."), sitemapImages: rufusPhotos },
];
for (const entry of standalone) seo.injectSeo(path.join(root, entry.file || entry.path), entry);
seo.writeSitemap(root, [
  ...standalone,
  { path: "projects.html" }, { path: "about.html" }, { path: "privacy.html" },
]);
console.log(`Injected SEO metadata into ${standalone.length} standalone pages and wrote sitemap.xml.`);
