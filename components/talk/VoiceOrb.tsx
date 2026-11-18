"use client";
// The big hold-to-talk button in the middle of /talk. Press and hold: it lights up; let go: the note
// is sent. While the agent answers it takes the agent's colour; pressing then talks over the agent.
// The pointer is captured on press, so a finger that drifts off the button does not end the note:
// only lifting it does. No motion (D-0001): the state is shown by the icon and the label, not by
// animation. Colours are the design tokens (--usa-primary, --usa-info), never fixed values.
import { AudioLines, Loader2, Mic } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { VoiceState } from "./useVoice";

export function VoiceOrb({ state, disabled, onDown, onUp }: {
  state: VoiceState;
  disabled?: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  const held = useRef(false);

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

  const tone = state === "speaking" ? "bg-usa-info text-usa-ink" : "bg-usa-primary text-usa-white";

  return (
    <button
      type="button"
      aria-label={state === "listening" ? "Listening. Let go to send" : state === "speaking" ? "Hold to talk over your agent" : "Hold to talk"}
      aria-pressed={state === "listening"}
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "relative z-10 flex size-36 touch-none select-none items-center justify-center rounded-full outline-none sm:size-40",
        tone,
        "[-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
        "focus-visible:ring-4 focus-visible:ring-usa-primary/50 disabled:cursor-not-allowed",
        state !== "thinking" && "disabled:opacity-40",
      )}
    >
      {state === "thinking" ? <Loader2 className="size-9 animate-spin opacity-90" />
        : state === "speaking" ? <AudioLines className="size-10 opacity-90" />
        : <Mic className={cn("size-10", state === "listening" && "scale-110")} />}
    </button>
  );
}
