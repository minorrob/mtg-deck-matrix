// Registry for the flight layer: every rendered card and every zone anchor.
export const cardEls = new Map<number, HTMLElement>();
export const anchorEls = new Map<string, HTMLElement>();

export function cardRef(id: number) {
  return (el: HTMLElement | null) => {
    if (el) cardEls.set(id, el);
    else if (cardEls.get(id) && !cardEls.get(id)!.isConnected) cardEls.delete(id);
  };
}

export function anchorRef(key: string) {
  return (el: HTMLElement | null) => {
    if (el) anchorEls.set(key, el);
    else if (anchorEls.get(key) && !anchorEls.get(key)!.isConnected) anchorEls.delete(key);
  };
}
