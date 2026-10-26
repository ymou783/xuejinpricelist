import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function AdminDialog({ title, children, onClose, busy = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useLayoutEffect(() => {
    const dialog = ref.current, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, []);
  return <dialog ref={ref} className={"admin-dialog" + (wide ? " is-wide" : "")} aria-labelledby={id} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header className="admin-dialog-header"><h2 id={id}>{title}</h2><button type="button" className="icon-button" aria-label="关闭窗口" disabled={busy} onClick={onClose}><X size={23} /></button></header>
    {children}
  </dialog>;
}
