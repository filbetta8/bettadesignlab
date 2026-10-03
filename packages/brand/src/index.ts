// Unica fonte per nome, link e testi di licenza. Nessuna app scrive questi valori a mano:
// li importa da qui, così un cambio di link o di licenza è una modifica sola.

export const BRAND = {
  name: 'Betta Design Lab',
  shortName: 'bettadesignlab',
  tagline: 'Generatori parametrici per stampa 3D: personalizza, guarda, scarica.',
  urls: {
    hub: './',
    // TODO: aggiornare quando la repo GitHub esiste
    github: '',
    support: '',
  },
  license: {
    free: 'Gratis per uso personale.',
    commercial: 'Per vendere le stampe serve una licenza commerciale.',
  },
  year: 2026,
} as const;

export type Brand = typeof BRAND;

/** Palette filamenti proposta nei selettori colore (nome → hex). */
export const FILAMENTS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'Bianco', hex: '#f2f0eb' },
  { name: 'Nero', hex: '#222222' },
  { name: 'Grigio', hex: '#8a8d91' },
  { name: 'Sabbia', hex: '#d9c7a3' },
  { name: 'Terracotta', hex: '#c0603f' },
  { name: 'Salvia', hex: '#8fa58a' },
  { name: 'Ottanio', hex: '#1f6f78' },
  { name: 'Blu notte', hex: '#25355e' },
  { name: 'Senape', hex: '#d4a429' },
  { name: 'Rosa cipria', hex: '#e3b3ad' },
];
