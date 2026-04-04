// lib/loadGoogleFont.ts
const loadedFonts = new Set<string>();

export function loadGoogleFont(fontFamily: string, weights = "400;700") {
    if (loadedFonts.has(fontFamily)) return; // already injected

    const id = `gfont-${fontFamily.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;

    const encodedFamily = fontFamily.replace(/ /g, "+");
    const href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weights}&display=swap`;

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);

    loadedFonts.add(fontFamily);
    console.debug(`Loaded Google Font: ${fontFamily} with weights ${weights}`);
}
