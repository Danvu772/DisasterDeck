"use client";
// The big hold-to-talk orb in the middle of /talk. Press and hold: it grows and follows your
// voice. Let go: it shrinks back and the note is sent. While the agent answers it takes the
// agent's colour and follows the agent's voice; pressing then talks over the agent.
// The pointer is captured on press, so a finger that drifts off the orb does not end the note:
// only lifting it does. Colours are the design tokens (--primary, --info), never fixed values.
import { animate, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { AudioLines, Loader2, Mic } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { VoiceState } from "./useVoice";

const BASE: Record<VoiceState, number> = { idle: 1, listening: 1.25, thinking: 0.9, speaking: 1.04 };

/** 0..1 loudness of whatever the analyser hears, read every frame. */
function useLevel(analyser: AnalyserNode | null) {
  const level = useMotionValue(0);
  useEffect(() => {
    if (!analyser) { animate(level, 0, { duration: 0.4 }); return; }
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      level.set(Math.min(1, rms * 5)); // speech sits around 0.05–0.2 RMS
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [analyser, level]);
  return useSpring(level, { stiffness: 300, damping: 22, mass: 0.6 });
}

export function VoiceOrb({ state, analyser, disabled, onDown, onUp }: {
  state: VoiceState;
  analyser: AnalyserNode | null;
  disabled?: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  const level = useLevel(analyser);
  const base = useMotionValue(1);
  const held = useRef(false);

  useEffect(() => {
    if (state === "thinking") {
      const c = animate(base, [0.94, 0.86, 0.94], { duration: 1.6, repeat: Infinity, ease: "easeInOut" });
      return () => c.stop();
    }
    const c = animate(base, BASE[state], { type: "spring", stiffness: 260, damping: 18 });
    return () => c.stop();
  }, [state, base]);

  const scale = useTransform(() => base.get() + level.get() * 0.2);
  const haloScale = useTransform(() => 1.05 + level.get() * 0.45 + (state === "listening" ? 0.1 : 0));
  const haloOpacity = useTransform(() => (state === "idle" ? 0.22 : 0.35) + level.get() * 0.55);

  const tone = state === "speaking" ? "var(--info)" : "var(--primary)";
  const sphere = {
    background: `radial-gradient(circle at 34% 28%, color-mix(in oklch, ${tone} 45%, white) 0%, ${tone} 52%, color-mix(in oklch, ${tone} 72%, black) 100%)`,
    boxShadow: `0 24px 60px -18px color-mix(in oklch, ${tone} 70%, transparent), inset 0 -10px 30px color-mix(in oklch, ${tone} 60%, black)`,
  };

  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable: release still ends it */ }
    held.current = true;
    onDown();
  };
  const up = () => {
    if (!held.current) return;
    held.current = false;
    onUp();
  };

  return (
    <div className="relative flex size-60 items-center justify-center sm:size-72">
      {/* Glow that breathes with the voice. A soft gradient, not a CSS blur: a blurred layer that
          scales every frame is cut into rectangles by the browser, which showed as boxes round the orb. */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-full"
        style={{ scale: haloScale, opacity: haloOpacity, background: `radial-gradient(circle closest-side, ${tone} 0%, color-mix(in oklch, ${tone} 35%, transparent) 45%, transparent 100%)` }} />
      {/* Rings that ripple out while you hold */}
      {state === "listening" && [0, 0.7].map((delay) => (
        <motion.span key={delay} aria-hidden className="pointer-events-none absolute inset-10 rounded-full border-2"
          style={{ borderColor: tone }}
          initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 1.4, repeat: Infinity, delay, ease: "easeOut" }} />
      ))}
      <motion.button
        type="button"
        aria-label={state === "listening" ? "Listening. Let go to send" : state === "speaking" ? "Hold to talk over your agent" : "Hold to talk"}
        aria-pressed={state === "listening"}
        disabled={disabled}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
        onContextMenu={(e) => e.preventDefault()}
        style={{ scale, ...sphere }}
        className={cn(
          "relative z-10 flex size-36 touch-none select-none items-center justify-center rounded-full text-primary-foreground outline-none sm:size-40",
          "[-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
          "focus-visible:ring-4 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
          // Thinking keeps the orb solid (the spinner says it is busy); only a voice that is off fades it.
          state !== "thinking" && "disabled:opacity-40",
        )}
      >
        {state === "thinking" ? <Loader2 className="size-9 animate-spin opacity-90" />
          : state === "speaking" ? <AudioLines className="size-10 opacity-90" />
          : <Mic className={cn("size-10 transition-transform", state === "listening" && "scale-110")} />}
      </motion.button>
    </div>
  );
}
