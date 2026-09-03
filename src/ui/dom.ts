/** Kucuk DOM yardimcilari. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = String(v);
    else if (k === "html") node.innerHTML = String(v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === "style" && typeof v === "string") node.setAttribute("style", v);
    else (node as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) node.append(c);
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Dokunmatikte hizli tepki veren tiklama baglayicisi. */
export function onTap(node: HTMLElement, fn: (ev: Event) => void): void {
  node.addEventListener("click", (ev) => {
    ev.preventDefault();
    fn(ev);
  });
}
