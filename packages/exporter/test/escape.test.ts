import { describe, expect, it } from "vitest";
import { escapeCssText, escapeHtmlAttribute, escapeHtmlText } from "../src/escape.js";

describe("escapeHtmlText — testo tra tag", () => {
  it("neutralizza un tentativo di iniettare un tag <script>", () => {
    const result = escapeHtmlText("<script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
    expect(result).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapa '&' prima di '<'/'>' (ordine significativo, non doppio escaping su '<'/'>')", () => {
    expect(escapeHtmlText("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("un '&' letterale diventa '&amp;', anche se il testo contiene già una sequenza che sembra un'entità (nessun rilevamento di entità preesistenti - solo escaping del carattere letterale)", () => {
    expect(escapeHtmlText("A&amp;B")).toBe("A&amp;amp;B");
  });

  it("stringa vuota e testo senza caratteri speciali restano invariati", () => {
    expect(escapeHtmlText("")).toBe("");
    expect(escapeHtmlText("Corsi di teatro")).toBe("Corsi di teatro");
  });

  it("caratteri unicode passano invariati (non sono HTML-significativi)", () => {
    expect(escapeHtmlText("Città — è già più")).toBe("Città — è già più");
  });
});

describe("escapeHtmlAttribute — valore dentro un attributo tra doppi apici", () => {
  it("neutralizza un tentativo di rompere l'attributo con un doppio apice (es. dentro href/alt/content)", () => {
    const result = escapeHtmlAttribute('x" onmouseover="alert(1)');
    expect(result).not.toContain('"');
    expect(result).toBe("x&quot; onmouseover=&quot;alert(1)");
  });

  it("neutralizza un tentativo con apice singolo", () => {
    const result = escapeHtmlAttribute("x' onmouseover='alert(1)");
    expect(result).not.toContain("'");
    expect(result).toBe("x&#39; onmouseover=&#39;alert(1)");
  });

  it("neutralizza un tag completo iniettato come valore (es. un 'alt' malevolo)", () => {
    const result = escapeHtmlAttribute('"><img src=x onerror=alert(1)>');
    expect(result).not.toMatch(/["<>]/);
    expect(result).toBe("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("stringa vuota e valore senza caratteri speciali restano invariati", () => {
    expect(escapeHtmlAttribute("")).toBe("");
    expect(escapeHtmlAttribute("https://example.com/pagina")).toBe("https://example.com/pagina");
  });
});

describe("escapeCssText — valore dentro una dichiarazione o una stringa CSS", () => {
  it("neutralizza un tentativo di chiudere la regola corrente e iniettarne una nuova (background/color/transform) - i caratteri restano presenti ma come escape CSS letterale, non come sintassi strutturale", () => {
    const result = escapeCssText("red}body{background:red");
    expect(result).toBe("red\\}body\\{background:red");
  });

  it("neutralizza un tentativo che aggiunge anche un ';' per iniettare una nuova dichiarazione prima di rompere la regola", () => {
    const result = escapeCssText("red;}*{background:red");
    expect(result).toBe("red\\;\\}*\\{background:red");
  });

  it("neutralizza un doppio apice che romperebbe una stringa CSS tra apici (font-family/url())", () => {
    const result = escapeCssText('Arial"; } body { background: red; font-family: "Arial');
    expect(result).toBe('Arial\\"\\; \\} body \\{ background: red\\; font-family: \\"Arial');
  });

  it("escapa '\\' PRIMA di ogni altro carattere - un valore con backslash e apici non produce un escape rotto", () => {
    const result = escapeCssText('a\\"b');
    // Il backslash originale diventa '\\\\', poi il doppio apice (originale,
    // non quello appena introdotto) diventa '\\"' - il risultato deve avere
    // ESATTAMENTE due backslash prima della "a" iniziale del secondo
    // segmento, non uno solo (che indicherebbe un doppio escaping errato).
    expect(result).toBe('a\\\\\\"b');
  });

  it("un a-capo letterale diventa l'escape esadecimale CSS standard, non viene rimosso silenziosamente", () => {
    expect(escapeCssText("red\nblue")).toBe("red\\A blue");
    expect(escapeCssText("red\r\nblue")).toBe("red\\A blue");
  });

  it("stringa vuota e valore senza caratteri speciali restano invariati", () => {
    expect(escapeCssText("")).toBe("");
    expect(escapeCssText("translateY(-6px)")).toBe("translateY(-6px)");
    expect(escapeCssText(".3s ease-out")).toBe(".3s ease-out");
  });
});

describe("escapeCssText — invariante generale: nessun carattere CSS-significativo sopravvive non-escapato", () => {
  const adversarial = [
    "}{;\"'\\",
    "\\}\\{",
    "\"'\"'\"'",
    "a}b{c;d\"e'f\\g",
  ];

  it.each(adversarial)("ogni occorrenza di } { ; \" ' \\ nel risultato è preceduta da un numero dispari di backslash (escape valido)", (input) => {
    const result = escapeCssText(input);
    // Verifica diretta: rimuovendo ogni coppia "\<carattere-speciale>" dal
    // risultato, non deve restare alcun carattere speciale isolato.
    const withoutEscapes = result.replace(/\\[{};"'\\]/g, "").replace(/\\A /g, "");
    expect(withoutEscapes).not.toMatch(/[{};"'\\]/);
  });
});
