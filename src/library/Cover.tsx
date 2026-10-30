import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface Props {
  title: string;
  artist: string;
  cover: string | null;
  size?: "sm" | "md" | "lg";
}

/** Pares de cores das capas geradas (fundo em degradê). */
const GRADIENTS = [
  ["#4b5bf0", "#8a5cf6"],
  ["#0f766e", "#22c55e"],
  ["#b45309", "#f59e0b"],
  ["#be123c", "#fb7185"],
  ["#1e3a8a", "#38bdf8"],
  ["#6d28d9", "#ec4899"],
  ["#334155", "#64748b"],
  ["#9a3412", "#ea580c"],
];

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Iniciais das duas primeiras palavras significativas do título. */
export function initials(title: string) {
  const words = title
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 || /\d/.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w[0])
      .join("") ||
    title.slice(0, 1) ||
    "♪"
  ).toUpperCase();
}

export function gradientFor(title: string, artist: string) {
  return GRADIENTS[hash(`${artist}|${title}`) % GRADIENTS.length];
}

/** Capa do álbum, ou uma capa desenhada com as iniciais quando não há imagem. */
export function Cover({ title, artist, cover, size = "md" }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  if (cover && broken !== cover) {
    return (
      <img
        className={`cover ${size}`}
        src={convertFileSrc(cover)}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setBroken(cover)}
      />
    );
  }
  const [from, to] = gradientFor(title, artist);
  return (
    <div
      className={`cover generated ${size}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-hidden
    >
      <span className="cover-initials">{initials(title)}</span>
      {size !== "sm" && artist && <span className="cover-artist">{artist}</span>}
    </div>
  );
}
