export type SampleEstimate = {
  title: string;
  wikipediaTitle: string;
  lat: number;
  lng: number;
  w3w: string;
  confidence: "low" | "medium" | "high";
  note: string;
};

export const SAMPLE_ESTIMATES: SampleEstimate[] = [
  {
    title: "The Dark Knight",
    wikipediaTitle: "The Dark Knight",
    lat: 41.8781,
    lng: -87.6298,
    w3w: "loom.farm.union",
    confidence: "low",
    note: "Placeholder estimate for MVP UI."
  },
  {
    title: "La La Land",
    wikipediaTitle: "La La Land (film)",
    lat: 34.0522,
    lng: -118.2437,
    w3w: "evening.fearful.drape",
    confidence: "low",
    note: "Placeholder estimate for MVP UI."
  },
  {
    title: "The Lord of the Rings: The Fellowship of the Ring",
    wikipediaTitle: "The Lord of the Rings: The Fellowship of the Ring",
    lat: -38.6857,
    lng: 176.0702,
    w3w: "tunes.rockets.sharing",
    confidence: "low",
    note: "Placeholder estimate for MVP UI."
  }
];

export function matchSampleEstimate(title: string): SampleEstimate | undefined {
  const normalized = title.trim().toLowerCase();
  return SAMPLE_ESTIMATES.find(
    (item) => item.title.toLowerCase() === normalized || item.wikipediaTitle.toLowerCase() === normalized
  );
}
