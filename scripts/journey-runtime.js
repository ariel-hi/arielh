(() => {
  'use strict';
  const projects = window.ARIEL_ATLAS;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Browsers can skip a native transition on fast navigation or a preference change.
  // Its ready promise rejects in that case; the ordinary navigation still succeeds.
  for (const type of ['pagereveal', 'pageswap']) window.addEventListener(type, event => {
    event.viewTransition?.ready.catch(() => {});
  });
  const path = location.pathname.replace(/index\.html$/, '');
  const current = projects.find(p => p.href === path);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const artwork = p => p.id === 'kinetic' ? null : p.id === 'word-king' ? '/images/project-word-king-20261006c.webp' : '/images/' + (p.id === 'rufus' ? 'rufus-04' : 'project-' + p.id) + '.webp';
  const dialog = document.createElement('dialog');
  dialog.className = 'atlas';
  dialog.setAttribute('aria-labelledby', 'atlas-title');
  dialog.innerHTML = `<div class="atlas-top"><a href="/" class="atlas-brand" aria-label="Ariel Hirschberg, home">ah.</a><button class="atlas-close" type="button" aria-label="Close project index">Close</button></div><div class="atlas-layout"><div class="atlas-index"><p class="eyebrow">Index / ${projects.length} projects</p><h2 id="atlas-title">Projects</h2>${['games','tools','experiments'].map(category => `<section class="atlas-group"><h3>${category}</h3>${projects.filter(p=>p.category===category).map(p=>`<a class="atlas-link" href="${esc(p.href)}" data-project="${p.id}"${p===current?' aria-current="page"':''}><span>${esc(p.name)}</span><span class="atlas-kind">${p.href.startsWith('https:')?esc(new URL(p.href).host):''}</span></a>`).join('')}</section>`).join('')}<a class="atlas-about" href="/about.html">About</a></div><div class="atlas-preview" aria-hidden="true"><div class="atlas-picture"></div><p class="atlas-type"></p><h3 class="atlas-name"></h3><p class="atlas-description"></p><p class="atlas-platform"></p></div></div>`;
  document.body.append(dialog);
  const picture = dialog.querySelector('.atlas-picture');
  let previewId;
  function preview(project) {
    if (previewId === project.id) return;
    previewId = project.id;
    const src = artwork(project);
    picture.replaceChildren();
    if (src) { const img = new Image(); img.src = src; img.alt = ''; picture.append(img); }
    else picture.innerHTML = '<span class="atlas-rel">REL</span>';
    dialog.querySelector('.atlas-type').textContent = project.type;
    dialog.querySelector('.atlas-name').textContent = project.name;
    dialog.querySelector('.atlas-description').textContent = project.description;
    dialog.querySelector('.atlas-platform').textContent = project.platform + ' / ' + project.controls;
    if (!reduced.matches) picture.animate([{opacity:.3,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:220,easing:'ease-out'});
  }
  let opener;
  function closeAtlas() { dialog.close(); }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-atlas-open]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
    event.preventDefault();
    opener = link;
    preview(current || projects[0]);
    dialog.showModal();
    document.documentElement.classList.add('atlas-is-open');
    if (!reduced.matches) dialog.animate([{opacity:0,transform:'translateY(20px)'},{opacity:1,transform:'none'}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'});
  });
  dialog.querySelector('.atlas-close').addEventListener('click', closeAtlas);
  dialog.addEventListener('close', () => { document.documentElement.classList.remove('atlas-is-open'); opener?.focus({preventScroll:true}); });
  dialog.addEventListener('click', event => { if (event.target === dialog) closeAtlas(); });
  for (const link of dialog.querySelectorAll('[data-project]')) {
    const project = projects.find(p => p.id === link.dataset.project);
    link.addEventListener('pointerenter', () => preview(project));
    link.addEventListener('focus', () => preview(project));
  }
  // Keep game inputs isolated from keyboard navigation inside the modal.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('keyup', event => event.stopPropagation());
  const nav = document.querySelector('.nav-links');
  if (current && nav) {
    const next = projects.filter(p => p.href.startsWith('/'));
    const following = next[(next.indexOf(current) + 1) % next.length];
    const link = document.createElement('a');
    link.className = 'journey-next';
    link.href = following.href;
    link.innerHTML = `<span class="journey-current">${esc(current.name)}</span><span>Next: ${esc(following.name)}</span>`;
    nav.before(link);
  }
  const scenes = [...document.querySelectorAll('.project-scene')];
  if (scenes.length) {
    const rail = document.createElement('nav');
    rail.className = 'chapter-rail'; rail.setAttribute('aria-label', 'Project chapters');
    rail.innerHTML = scenes.map((scene,i)=>`<a href="#${scene.id}" aria-label="${esc(scene.getAttribute('aria-label'))}"><span class="chapter-label">${esc(scene.getAttribute('aria-label'))}</span><span class="chapter-tick" aria-hidden="true"></span><span class="chapter-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span></a>`).join('');
    document.body.append(rail);
    const links = [...rail.querySelectorAll('a')];
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        links.forEach((link,i)=>{if(scenes[i]===entry.target)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
      }
    }, {rootMargin:'-35% 0px -35% 0px'});
    scenes.forEach(scene=>observer.observe(scene));
    const hero = document.querySelector('.home-visual');
    const heroObserver = new IntersectionObserver(entries=>{ rail.classList.toggle('is-visible',!entries[0].isIntersecting); },{threshold:.2});
    if(hero)heroObserver.observe(hero);
  }
  // Native same-origin view transitions preserve real URLs, Back, and game lifecycles.
  window.addEventListener('pageshow', () => { if(dialog.open)dialog.close(); });
})();
