// Som pelo teclado: os eventos que o player do alphaTab toca (banda, a outra
// mão, metrônomo) viram mensagens MIDI para o teclado, e o som do computador
// fica mudo. O canal 1 fica livre para o timbre que o aluno escolheu no
// teclado; a bateria continua no canal 10.

import * as alphaTab from "@coderline/alphatab";

const Type = alphaTab.midi.MidiEventType;

/** Canal no teclado para um canal do alphaTab (0-15, a partir de 0). */
export function channelFor(channel: number) {
  if (channel === 9) return 9;
  if (channel < 8) return channel + 1;
  if (channel === 8) return 10;
  return Math.min(15, channel + 1);
}

/** Bloco de madeira agudo no primeiro tempo, grave nos outros. */
const METRONOME = { accent: 76, beat: 77 };

interface EventLike {
  type: number;
  channel?: number;
  data1: number;
  data2: number;
  metronomeNumerator?: number;
}

export function eventsToBytes(events: EventLike[]): number[] {
  const out: number[] = [];
  for (const e of events) {
    const ch = channelFor(e.channel ?? 0);
    switch (e.type) {
      case Type.NoteOn:
        out.push(0x90 | ch, e.data1 & 0x7f, e.data2 & 0x7f);
        break;
      case Type.NoteOff:
        out.push(0x80 | ch, e.data1 & 0x7f, 0);
        break;
      case Type.ControlChange:
        // Mensagens de modo do canal (Local Control, all notes off…) não passam.
        if (e.data1 < 120) out.push(0xb0 | ch, e.data1 & 0x7f, e.data2 & 0x7f);
        break;
      case Type.ProgramChange:
        out.push(0xc0 | ch, e.data1 & 0x7f);
        break;
      case Type.PitchBend:
        out.push(0xe0 | ch, e.data1 & 0x7f, e.data2 & 0x7f);
        break;
      case Type.AlphaTabMetronome: {
        const key = e.metronomeNumerator === 0 ? METRONOME.accent : METRONOME.beat;
        out.push(0x99, key, e.metronomeNumerator === 0 ? 110 : 80, 0x89, key, 0);
        break;
      }
    }
  }
  return out;
}

export const EVENT_FILTER = [
  Type.NoteOn,
  Type.NoteOff,
  Type.ControlChange,
  Type.ProgramChange,
  Type.PitchBend,
  Type.AlphaTabMetronome,
];

/** Solta o pedal e cala todas as notas nos canais usados pela banda. */
export function silence(): number[] {
  const out: number[] = [];
  for (let ch = 1; ch < 16; ch++) out.push(0xb0 | ch, 64, 0, 0xb0 | ch, 123, 0);
  return out;
}
