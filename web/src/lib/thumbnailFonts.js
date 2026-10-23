export const THUMBNAIL_FONTS = [
  { id: 'gagalin', label: 'Gagalin', family: 'Gagalin, Impact, sans-serif', weight: '400' },
  { id: 'inter', label: 'Inter', family: 'Inter, system-ui, sans-serif', weight: '800' },
  { id: 'bebas', label: 'Bebas Neue', family: '"Bebas Neue", sans-serif', weight: '400' },
  { id: 'anton', label: 'Anton', family: 'Anton, sans-serif', weight: '400' },
  { id: 'archivo', label: 'Archivo Black', family: '"Archivo Black", sans-serif', weight: '400' },
  { id: 'oswald', label: 'Oswald', family: 'Oswald, sans-serif', weight: '700' },
  { id: 'montserrat', label: 'Montserrat', family: 'Montserrat, sans-serif', weight: '800' },
  { id: 'poppins', label: 'Poppins', family: 'Poppins, sans-serif', weight: '800' },
  { id: 'roboto', label: 'Roboto Condensed', family: '"Roboto Condensed", sans-serif', weight: '700' },
  { id: 'playfair', label: 'Playfair Display', family: '"Playfair Display", serif', weight: '800' },
  { id: 'bangers', label: 'Bangers', family: 'Bangers, system-ui', weight: '400' },
];

export function fontById(id) {
  return THUMBNAIL_FONTS.find((f) => f.id === id) || THUMBNAIL_FONTS[0];
}

export async function ensureFontsLoaded() {
  if (!document.fonts?.load) return;
  await Promise.all(
    THUMBNAIL_FONTS.map((f) => document.fonts.load(`${f.weight} 64px ${f.family}`).catch(() => null))
  );
  await document.fonts.ready.catch(() => null);
}
