// Human review notes on HOT/OSM building references, kept in this browser (no backend yet).
// MapLibre and the controls share this; exporting merges notes from every evidence view.
export const BUILDING_REVIEW_STORAGE = "antakya-building-review-v1";

export interface BuildingReview {
  status: "needs-field-check" | "visible-change" | "uncertain";
  reviewedAt: string;
  referenceId: string;
  pilot: string;
}

export const REVIEW_STATUSES: { value: "" | BuildingReview["status"]; label: string }[] = [
  { value: "", label: "Not reviewed" },
  { value: "needs-field-check", label: "Needs field check" },
  { value: "visible-change", label: "Visible change in images" },
  { value: "uncertain", label: "Uncertain / alignment issue" },
];

export function loadReviews(): Record<string, BuildingReview> {
  try {
    return JSON.parse(localStorage.getItem(BUILDING_REVIEW_STORAGE) ?? "{}");
  } catch {
    return {};
  }
}

export function saveReview(referenceId: string, status: string) {
  try {
    const reviews = loadReviews();
    if (status) reviews[referenceId] = { status: status as BuildingReview["status"], reviewedAt: new Date().toISOString(), referenceId, pilot: "antakya-2023" };
    else delete reviews[referenceId];
    localStorage.setItem(BUILDING_REVIEW_STORAGE, JSON.stringify(reviews));
  } catch {
    // Browser storage unavailable; the note is dropped, not a reason to fail.
  }
}

/** Trigger a browser download of every review note, one JSON file. */
export function exportReviews() {
  const reviews = loadReviews();
  const blob = new Blob([JSON.stringify({
    pilot: "antakya-2023",
    exportedAt: new Date().toISOString(),
    scope: "Local human notes; not field-validated damage or model output",
    reviews,
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "antakya-building-reviews.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
