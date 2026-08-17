import { describe, expect, it } from "vitest";
import { readFileAsDataUrl } from "../../src/fileUpload/readFileAsDataUrl.js";

describe("readFileAsDataUrl", () => {
  it("produce una data-URI valida (data:<mime>;base64,...) per un file di testo", async () => {
    const file = new File(["ciao"], "prova.txt", { type: "text/plain" });
    const dataUrl = await readFileAsDataUrl(file);
    expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
    // "ciao" in base64 è "Y2lhbw==" - verifica che il contenuto sia davvero quello del file, non solo la forma.
    expect(dataUrl).toBe("data:text/plain;base64,Y2lhbw==");
  });

  it("deduce il MIME type dal file (nessuna interpretazione propria)", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "font.ttf", { type: "font/ttf" });
    const dataUrl = await readFileAsDataUrl(file);
    expect(dataUrl.startsWith("data:font/ttf;base64,")).toBe(true);
  });

  it("funziona anche con un MIME type vuoto (alcuni tipi di file, es. certi font, il browser non lo determina)", async () => {
    const file = new File([new Uint8Array([9, 9])], "sconosciuto.bin", { type: "" });
    const dataUrl = await readFileAsDataUrl(file);
    expect(dataUrl.startsWith("data:")).toBe(true);
    expect(dataUrl).toContain(";base64,");
  });
});
