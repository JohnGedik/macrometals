type RelationshipStrength = "strong-positive" | "moderate-positive" | "weak" | "moderate-negative" | "strong-negative" | "unavailable";
type RelationshipImpact = "very-high" | "high" | "medium" | "low" | "minimal" | "unavailable";

export function classifyPriceRelationship(value: number | null | undefined): {
  correlation: number | null;
  strength: RelationshipStrength;
  stars: number;
  impact: RelationshipImpact;
} {
  const correlation = typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1 ? value : null;
  if (correlation === null) return { correlation, strength: "unavailable" as const, stars: 0, impact: "unavailable" as const };
  const strength = correlation >= 0.7 ? "strong-positive" : correlation >= 0.3 ? "moderate-positive"
    : correlation <= -0.7 ? "strong-negative" : correlation <= -0.3 ? "moderate-negative" : "weak";
  const magnitude = Math.abs(correlation);
  const stars = magnitude >= 0.8 ? 5 : magnitude >= 0.6 ? 4 : magnitude >= 0.4 ? 3 : magnitude >= 0.2 ? 2 : 1;
  const impact = stars === 5 ? "very-high" : stars === 4 ? "high" : stars === 3 ? "medium" : stars === 2 ? "low" : "minimal";
  return { correlation, strength, stars, impact };
}