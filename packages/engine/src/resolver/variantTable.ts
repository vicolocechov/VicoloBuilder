/**
 * Mapping dichiarativo incorporato variant -> proprietà reali (RFC-000 §8,
 * esempio esplicito: variant:"primary" -> background/color/padding/radius).
 * Tabella semplice, non un Capability/Property Registry completo (RFC-002) -
 * scelta di scope registrata in DECISIONS.md, D-008.
 */
export const VARIANT_TABLE: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  primary: { background: "#0f8a7d", color: "#ffffff", padding: 12, radius: 8 },
  secondary: { background: "#eef1f0", color: "#16211f", padding: 12, radius: 8 },
};
