// Search and social metadata for every public page, plus sitemap.xml.
// Generated pages call seoHead(); standalone pages get a marked block injected.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ORIGIN = "https://arielh.com";
const SITE_NAME = "Ariel Hirschberg";
const PERSON_ID = `${ORIGIN}/#person`;
const WEBSITE_ID = `${ORIGIN}/#website`;
const DEFAULT_IMAGE = { src: "images/social-card.png", width: 1199, height: 630, alt: "Ariel Hirschberg: games, tools, and experiments" };

const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
// Keep "</script>" in data from closing the JSON-LD element.
const jsonLd = (data) => JSON.stringify(data, null, 2).replace(/</g, "\\u003c");

const person = {
  "@type": "Person",
  "@id": PERSON_ID,
  name: SITE_NAME,
  url: `${ORIGIN}/`,
  image: `${ORIGIN}/${DEFAULT_IMAGE.src}`,
  alumniOf: { "@type": "CollegeOrUniversity", name: "University of California, Berkeley" },
  sameAs: ["https://github.com/ariel-hi"],
};
const website = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: `${ORIGIN}/`,
  name: SITE_NAME,
  alternateName: "arielh.com",
  description: "Games, tools, and visual experiments by Ariel Hirschberg.",
  inLanguage: "en",
  publisher: { "@id": PERSON_ID },
  author: { "@id": PERSON_ID },
};

function breadcrumbs(url, name) {
  if (url === `${ORIGIN}/`) return null;
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name, item: url },
    ],
  };
}

// page: { path, title, fullTitle, description, image, pageType, name, main, noindex }
function seoHead(page) {
  const url = `${ORIGIN}/${page.path}`;
  const image = page.image || DEFAULT_IMAGE;
  const imageUrl = `${ORIGIN}/${image.src}`;
  const imageType = image.src.endsWith(".png") ? "image/png" : "image/webp";
  const graph = [person, website, {
    "@type": page.pageType || "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: page.fullTitle,
    description: page.description,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    author: { "@id": PERSON_ID },
    primaryImageOfPage: { "@type": "ImageObject", url: imageUrl, width: image.width, height: image.height },
    ...(page.pageType === "ProfilePage" ? { mainEntity: { "@id": PERSON_ID } } : {}),
    ...(page.main ? { mainEntity: page.main } : {}),
    ...(breadcrumbs(url, page.name || page.title) ? { breadcrumb: breadcrumbs(url, page.name || page.title) } : {}),
  }];
  const lines = [
    `<meta name="robots" content="${page.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}">`,
    `<meta name="author" content="${SITE_NAME}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:image" content="${imageUrl}">`,
    `<meta property="og:image:type" content="${imageType}">`,
    `<meta property="og:image:width" content="${image.width}">`,
    `<meta property="og:image:height" content="${image.height}">`,
    `<meta property="og:image:alt" content="${esc(image.alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(page.fullTitle)}">`,
    `<meta name="twitter:description" content="${esc(page.description)}">`,
    `<meta name="twitter:image" content="${imageUrl}">`,
    `<meta name="twitter:image:alt" content="${esc(image.alt)}">`,
  ];
  if (!page.noindex) lines.push(`<script type="application/ld+json">\n${jsonLd({ "@context": "https://schema.org", "@graph": graph })}\n</script>`);
  return lines.join("\n  ");
}

const START = "<!-- seo:start -->";
const END = "<!-- seo:end -->";
// Tags that the generated block owns. Existing copies are removed so a page never ships duplicates.
const OWNED = /^[ \t]*(?:<meta\s+(?:property="og:(?:image[^"]*|site_name|locale)"|name="(?:twitter:[^"]+|robots|author)")[^>]*>|<script type="application\/ld\+json">[\s\S]*?<\/script>)[ \t]*\r?\n/gm;

function injectSeo(file, page) {
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(new RegExp(`[ \\t]*${START}[\\s\\S]*?${END}\\r?\\n`), "");
  const headEnd = html.indexOf("</head>");
  if (headEnd < 0) throw new Error(`No </head> in ${file}`);
  const head = html.slice(0, headEnd).replace(OWNED, "");
  html = `${head}  ${START}\n  ${seoHead(page)}\n  ${END}\n${html.slice(headEnd)}`;
  fs.writeFileSync(file, html);
}

// The build rewrites files, so mtime is meaningless: use the last commit unless the file has uncommitted edits.
function lastModified(root, file) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (git(["status", "--porcelain", "--", file])) return today;
    return git(["log", "-1", "--format=%cs", "--", file]) || today;
  } catch { return today; }
}

function writeSitemap(root, pages) {
  const urls = pages.filter((page) => !page.noindex).map((page) => {
    const file = path.join(root, page.file || page.path || "index.html");
    const lastmod = lastModified(root, file);
    const images = (page.sitemapImages || [page.image || DEFAULT_IMAGE])
      .map((image) => `\n    <image:image><image:loc>${ORIGIN}/${image.src}</image:loc></image:image>`).join("");
    return `  <url>\n    <loc>${ORIGIN}/${page.path}</loc>\n    <lastmod>${lastmod}</lastmod>${images}\n  </url>`;
  });
  fs.writeFileSync(path.join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>
`);
}

module.exports = { ORIGIN, PERSON_ID, DEFAULT_IMAGE, esc, seoHead, injectSeo, writeSitemap };
