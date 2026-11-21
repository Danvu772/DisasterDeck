"use client";
// A live sound wave: mirrored bars drawn from an AnalyserNode, about 60 times a second.
// Idle (no analyser) it rests as a row of small dots. Colours come from the design tokens
// (--primary for the person, --info for the agent), read at runtime and again when the theme flips.
import { useEffect, useRef } from "react";
import { tokenColor } from "../map/gl/tokens";
import { useIsDark } from "../theme/theme";

const BARS = 48;

export function Waveform({ analyser, tone, label }: {
  analyser: AnalyserNode | null;
  tone: "person" | "agent";
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>(Array(BARS).fill(0));
  const dark = useIsDark();

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const color = tokenColor(tone === "person" ? "primary" : "info");
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let frame = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (analyser && data) {
        analyser.getByteFrequencyData(data);
        // Voices live in the low bins: spread the first ~60% of the spectrum over the bars.
        const span = Math.floor(data.length * 0.6);
        for (let i = 0; i < BARS; i++) {
          const from = Math.floor((i / BARS) * span), to = Math.max(from + 1, Math.floor(((i + 1) / BARS) * span));
          let sum = 0;
          for (let j = from; j < to; j++) sum += data[j];
          const target = sum / (to - from) / 255;
          levels.current[i] += (target - levels.current[i]) * 0.35; // ease, so bars breathe instead of jitter
        }
      } else {
        for (let i = 0; i < BARS; i++) levels.current[i] *= 0.85; // fall back to rest
      }

      const gap = 3, barW = (w - gap * (BARS - 1)) / BARS, mid = h / 2;
      ctx.fillStyle = color;
      for (let i = 0; i < BARS; i++) {
        // Middle bars a little taller: the wave reads as a voice, not an equaliser.
        const shape = 0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / BARS);
        const half = Math.max(2.5, levels.current[i] * shape * (mid - 2));
        const x = i * (barW + gap);
        ctx.globalAlpha = analyser ? 0.9 : 0.45;
        ctx.beginPath();
        ctx.roundRect(x, mid - half, barW, half * 2, barW / 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser, tone, dark]);

  return <canvas ref={canvas} role="img" aria-label={label} className="h-20 w-full" />;
}
