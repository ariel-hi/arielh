(() => {
  "use strict";
  document.querySelectorAll("[data-year]").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
  const filters = document.querySelector("[data-project-filters]");
  if (!filters) return;
  filters.hidden = false;
  const cards = Array.from(
    document.querySelectorAll("[data-project-category]"),
  );
  const count = document.querySelector("[data-project-count]");
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    const category = button.dataset.filter;
    const before = new Map(cards.filter(card => !card.hidden).map(card => [card, card.getBoundingClientRect().top]));
    filters.querySelectorAll("button").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    let visible = 0;
    cards.forEach((card) => {
      card.hidden =
        category !== "all" && card.dataset.projectCategory !== category;
      if (!card.hidden) visible++;
    });
    if (count)
      count.textContent = `${visible} ${visible === 1 ? "project" : "projects"}`;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cards.filter(card => !card.hidden).forEach(card => {
        const offset = before.has(card) ? before.get(card) - card.getBoundingClientRect().top : 14;
        card.animate([{transform:`translateY(${offset}px)`,opacity:before.has(card)?1:0},{transform:'none',opacity:1}], {duration:300,easing:'cubic-bezier(.2,.8,.2,1)'});
      });
    }
  });
})();
