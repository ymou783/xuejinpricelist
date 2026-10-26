export async function copyText(value: string, container: HTMLElement = document.body) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* Use the click-initiated fallback below. */ }
  }
  const active = document.activeElement;
  const field = document.createElement("textarea");
  field.value = value; field.readOnly = true; field.tabIndex = -1; field.setAttribute("aria-label", "复制客服信息");
  field.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;font-size:16px;opacity:0;pointer-events:none";
  // The temporary field must stay inside a modal, since the rest of the page is inert.
  container.append(field);
  try {
    field.focus({ preventScroll: true }); field.select(); field.setSelectionRange(0, value.length);
    if (!document.execCommand("copy")) throw new Error("复制暂时不可用");
  } finally { field.remove(); if (active instanceof HTMLElement) active.focus({ preventScroll: true }); }
}
