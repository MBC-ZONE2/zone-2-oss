// Lightweight scroll-reveal — pure IntersectionObserver, no external deps.
// Respects prefers-reduced-motion (skips entirely, content shown immediately).
// Offline-safe: bundled with the theme, no CDN.

const REVEAL_SELECTOR = [
  ".vp-doc h2",
  ".vp-doc h3",
  ".vp-doc p",
  ".vp-doc ul",
  ".vp-doc ol",
  ".vp-doc blockquote",
  ".vp-doc table",
  ".vp-doc .custom-block",
  ".vp-doc pre",
  ".vp-doc .zflow-node",
  ".vp-doc .ztemp-chip",
  ".vp-doc .ztopo-leaf",
  // NOTE: .mermaid is intentionally excluded — mermaid measures its container's
  // size on render, and starting it at opacity:0/translated yields a 0-size box
  // that makes mermaid flash its error graphic before self-correcting.
  ".VPFeature",
].join(",");

let observer: IntersectionObserver | null = null;

function reduceMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function tag(el: Element, i: number) {
  if ((el as HTMLElement).dataset.zReveal) return;
  (el as HTMLElement).dataset.zReveal = "1";
  // subtle stagger, capped so long pages don't drift
  (el as HTMLElement).style.setProperty(
    "--z-reveal-delay",
    `${Math.min(i, 6) * 45}ms`,
  );
  observer?.observe(el);
}

export function initReveal() {
  if (typeof window === "undefined") return;
  if (reduceMotion()) {
    document
      .querySelectorAll(REVEAL_SELECTOR)
      .forEach((el) => el.classList.add("z-reveal-shown"));
    return;
  }

  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("z-reveal-shown");
            observer?.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
  }

  const nodes = document.querySelectorAll(REVEAL_SELECTOR);
  nodes.forEach((el, i) => {
    el.classList.add("z-reveal");
    // Elements already in view on load: reveal on next frame (no jank).
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => el.classList.add("z-reveal-shown")),
      );
    } else {
      tag(el, i);
    }
  });
}
