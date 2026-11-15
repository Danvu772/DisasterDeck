// MapLibre paint and <canvas> need real colours, and MapLibre does not parse oklch().
// Read a raw token (--destructive, not --color-destructive) and let the browser turn it into rgb.
let probe: CanvasRenderingContext2D | null = null;

export function tokenColor(name: string, alpha = 1): string {
  if (typeof window === "undefined") return "rgba(0,0,0,0)";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  if (!raw) return "rgba(0,0,0,0)";
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return raw;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = raw;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${((a / 255) * alpha).toFixed(3)})`;
}
