export type WarningKind = "overflow" | "belowFloor" | "missing-embed" | "mermaid-error" | "low-contrast";
export interface Warning { slideIndex: number; kind: WarningKind; message: string; sourceLine?: number; }
