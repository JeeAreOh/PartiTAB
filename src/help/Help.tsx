import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { HELP_TOPICS } from "./topics";

/** Sem acento e em minúsculas, para a busca. */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

interface Props {
  onClose: () => void;
  /** Tópico para abrir já posicionado (ex.: "secoes"). */
  initialTopic?: string;
}

/** Ajuda: todas as funcionalidades, com índice e busca. */
export function Help({ onClose, initialTopic }: Props) {
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(initialTopic ?? HELP_TOPICS[0].id);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // O texto de cada tópico (já desenhado) entra na busca.
  useLayoutEffect(() => {
    const next: Record<string, string> = {};
    for (const t of HELP_TOPICS) {
      next[t.id] = fold(`${t.group} ${t.title} ${t.keywords} ${refs.current[t.id]?.textContent ?? ""}`);
    }
    setTexts(next);
    if (initialTopic) refs.current[initialTopic]?.scrollIntoView();
  }, [initialTopic]);

  const visible = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return new Set(HELP_TOPICS.map((t) => t.id));
    return new Set(
      HELP_TOPICS.filter((t) => words.every((w) => (texts[t.id] ?? "").includes(w))).map(
        (t) => t.id,
      ),
    );
  }, [query, texts]);

  // O índice acompanha o tópico que está no topo da leitura.
  const onScroll = () => {
    const box = content.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top + 24;
    let id = current;
    for (const t of HELP_TOPICS) {
      const el = refs.current[t.id];
      if (el && visible.has(t.id) && el.getBoundingClientRect().top <= top) id = t.id;
    }
    if (id !== current) setCurrent(id);
  };

  const go = (id: string) => {
    refs.current[id]?.scrollIntoView({ block: "start" });
    // Os últimos tópicos não chegam ao topo: o clicado fica marcado mesmo assim.
    setCurrent(id);
  };

  const groups = [...new Set(HELP_TOPICS.map((t) => t.group))];

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div
        className="help"
        role="dialog"
        aria-modal="true"
        aria-label="Ajuda"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="help-head">
          <h2>
            <Icon name="help" /> Ajuda
          </h2>
          <label className="help-search">
            <Icon name="search" size={16} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Procurar na ajuda — ex.: loop, dedilhado, MIDI"
              aria-label="Procurar na ajuda"
            />
          </label>
          <button className="icon-button" onClick={onClose} aria-label="Fechar ajuda">
            <Icon name="close" />
          </button>
        </header>

        <div className="help-body">
          <nav className="help-toc" aria-label="Tópicos da ajuda">
            {groups.map((g) => {
              const topics = HELP_TOPICS.filter((t) => t.group === g && visible.has(t.id));
              if (!topics.length) return null;
              return (
                <div key={g}>
                  <h4>{g}</h4>
                  {topics.map((t) => (
                    <button
                      key={t.id}
                      className={current === t.id ? "on" : ""}
                      onClick={() => go(t.id)}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="help-content" ref={content} onScroll={onScroll}>
            {visible.size === 0 && (
              <p className="muted">Nada encontrado para “{query}”. Tente outra palavra.</p>
            )}
            {HELP_TOPICS.map((t, i) => (
              <section
                key={t.id}
                id={`ajuda-${t.id}`}
                ref={(el) => {
                  refs.current[t.id] = el;
                }}
                hidden={!visible.has(t.id)}
                className="help-topic"
              >
                {(i === 0 || HELP_TOPICS[i - 1].group !== t.group) && (
                  <span className="help-group">{t.group}</span>
                )}
                <h3>{t.title}</h3>
                {t.body}
              </section>
            ))}
            <p className="muted small help-foot">
              PartiTAB — prática de piano com partitura, correção nota a nota e o seu teclado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
