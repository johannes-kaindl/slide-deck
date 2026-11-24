import { describe, expect, it } from "vitest";
import { createPiiRedactor, createRedactionSession, redactText } from "../src/vendor/kit/redact";

// Sicherheitsfix aus code-kit 0.79.1 (Geheimnis hinter einem Wortzeichen) und 0.82.0 (IBAN hinter einem Wortzeichen):
// der gevendorte Stand muss beide Formen schwärzen, sonst steht ein Schlüssel im Klartext in einer Antwort oder einem Log.
describe("redact (vendort, code-kit 0.87.0)", () => {
  it("schwärzt ein Geheimnis, das an ein Wortzeichen geklebt ist (key_sk-proj-…)", () => {
    const r = redactText("Der Wert key_sk-proj-ABCDEFGHIJKLMNOP steht im Text.");
    expect(r.text).not.toContain("sk-proj-ABCDEFGHIJKLMNOP");
    expect(r.count).toBeGreaterThan(0);
  });

  it("die Sitzung (Weg des Chat-Clients) schwärzt dasselbe", () => {
    const s = createRedactionSession();
    const out = s.redact("key_sk-proj-ABCDEFGHIJKLMNOP");
    expect(out).not.toContain("sk-proj-ABCDEFGHIJKLMNOP");
  });

  it("schwärzt eine IBAN hinter einem Wortzeichen (iban_DE89…)", () => {
    // Vor 0.82.0 blieb `DE` stehen und die Ziffern gingen zufällig als Telefonnummer weg („iban_DE[PHONE_1]“, kein IBAN-Etikett).
    expect(createPiiRedactor().text("iban_DE89370400440532013000")).toBe("iban_[IBAN_1]");
  });
});
