// Load a Japanese-capable font subset from Google Fonts for exactly the glyphs
// we render. Google serves TrueType (satori-compatible) to non-browser UAs, so
// we can parse the ttf url out of the CSS response.
export async function loadJapaneseFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const family = 'Noto+Sans+JP:wght@700';
    const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`;
    const cssResponse = await fetch(url, {
      headers: {
        // Force a TrueType payload (satori does not support woff2).
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.30 (KHTML, like Gecko)',
      },
    });
    if (!cssResponse.ok) return null;
    const css = await cssResponse.text();
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?(?:opentype|truetype)['"]?\)/);
    if (!match) return null;
    const fontResponse = await fetch(match[1]);
    if (!fontResponse.ok) return null;
    return await fontResponse.arrayBuffer();
  } catch (error) {
    console.warn('OGP font load failed:', error);
    return null;
  }
}
