import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  /** Conteúdo do botão que abre. */
  label: ReactNode;
  title?: string;
  /** Destaque no botão (ex.: arranjo ativo). */
  active?: boolean;
  align?: "left" | "right";
  children: ReactNode | ((close: () => void) => ReactNode);
}

/** Botão com painel flutuante; fecha com Esc ou clique fora. */
export function Popover({ label, title, active, align = "left", children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className="popover" ref={ref}>
      <button
        className={["ghost", active ? "active" : "", open ? "open" : ""].join(" ")}
        title={title}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div className={`popover-panel ${align}`} role="dialog">
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
