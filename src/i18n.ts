export type Lang = "en" | "de";
let currentLang: Lang = "en";
export function pickLang(raw?: string | null): Lang { return raw && raw.toLowerCase().startsWith("de") ? "de" : "en"; }
export function setLang(lang: Lang): void { currentLang = lang; }
export function getLang(): Lang { return currentLang; }
type Dict = Record<string, string>;

const EN: Dict = {
  "cmd.openPreview": "Open presentation preview",
  "cmd.exportPdf": "Export presentation to PDF",
  "cmd.exportImages": "Export presentation to image series",
  "notice.noActiveNote": "No active note.",
  "notice.exporting": "Exporting…",
  "export.done": "Exported {0} slides",
  "warn.overflow": "Slide {0}: content overflows — condense it",
  "warn.missingEmbed": "Slide {0}: embed not found",
  "preview.empty": "No slides. Separate slides with a line containing only ---",
  "settings.heading": "Slide deck",
  "settings.theme.name": "Default theme",
  "settings.theme.desc": "Preset used when a note has no theme directive",
  "settings.customCss.name": "Custom CSS",
  "settings.customCss.desc": "Appended to the selected theme. Target .sd-slide{ --sd-token:… } to override design tokens.",
  "settings.minFont.name": "Minimum body font size (px)",
  "settings.minFont.desc": "Legibility floor; slides that need smaller text are flagged",
  "settings.imageScale.name": "Image export scale",
  "settings.imageScale.desc": "Pixel multiplier for PNG export (2 = crisp)",
  "preview.error": "Render error: {0}",
  "preview.hint": "Open a Markdown note, then click Refresh.",
  "notice.exportFailed": "Export failed: {0}",
  "toolbar.refresh": "Refresh",
  "toolbar.exportPdf": "PDF",
  "toolbar.exportImages": "Images",
};
const DE: Dict = {
  "cmd.openPreview": "Präsentations-Vorschau öffnen",
  "cmd.exportPdf": "Präsentation als PDF exportieren",
  "cmd.exportImages": "Präsentation als Bilderserie exportieren",
  "notice.noActiveNote": "Keine aktive Notiz.",
  "notice.exporting": "Exportiere…",
  "export.done": "{0} Folien exportiert",
  "warn.overflow": "Folie {0}: Inhalt läuft über — verdichten",
  "warn.missingEmbed": "Folie {0}: Embed nicht gefunden",
  "preview.empty": "Keine Folien. Folien mit einer Zeile aus nur --- trennen",
  "settings.heading": "Slide deck",
  "settings.theme.name": "Standard-Theme",
  "settings.theme.desc": "Preset, wenn eine Notiz keine theme-Direktive hat",
  "settings.customCss.name": "Eigenes CSS",
  "settings.customCss.desc": "Wird ans gewählte Theme angehängt. Adressiere .sd-slide{ --sd-token:… }, um Design-Tokens zu überschreiben.",
  "settings.minFont.name": "Mindest-Schriftgröße Body (px)",
  "settings.minFont.desc": "Lesbarkeits-Boden; Folien mit kleinerem Text werden markiert",
  "settings.imageScale.name": "Bild-Export-Skalierung",
  "settings.imageScale.desc": "Pixel-Multiplikator für PNG-Export (2 = scharf)",
  "preview.error": "Render-Fehler: {0}",
  "preview.hint": "Öffne eine Markdown-Notiz und klicke auf Aktualisieren.",
  "notice.exportFailed": "Export fehlgeschlagen: {0}",
  "toolbar.refresh": "Aktualisieren",
  "toolbar.exportPdf": "PDF",
  "toolbar.exportImages": "Bilder",
};
const STRINGS: Record<Lang, Dict> = { en: EN, de: DE };
export function t(key: string, ...args: (string | number)[]): string {
  const raw = STRINGS[currentLang][key] ?? STRINGS.en[key] ?? key;
  return raw.replace(/\{(\d+)\}/g, (_m, i) => { const v = args[Number(i)]; return v === undefined ? `{${i}}` : String(v); });
}
