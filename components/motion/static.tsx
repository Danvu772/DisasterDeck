"use client";
// Production stand-in for "motion/react" (D-0001: motion only behind demo mode).
// next.config.ts aliases "motion/react" to this file in every build without DEMO_MODE=1, so the
// production bundle carries none of motion's code. The screens render the same elements with
// their final look and no animation. Exports only what app/ and components/ import from
// motion/react today; `npx next build` with DEMO_MODE=0 fails if a screen imports something else.
import { createElement, forwardRef, Fragment, type ReactNode } from "react";

// Props motion reads and the DOM must never see.
const MOTION_PROPS = new Set([
  "initial", "animate", "exit", "transition", "variants", "custom", "inherit",
  "layout", "layoutId", "layoutDependency", "layoutScroll", "layoutRoot",
  "whileHover", "whileTap", "whileFocus", "whileDrag", "whileInView", "viewport",
  "drag", "dragConstraints", "dragElastic", "dragMomentum", "dragListener", "dragControls",
  "dragSnapToOrigin", "dragDirectionLock", "dragPropagation", "dragTransition",
  "onAnimationStart", "onAnimationComplete", "onUpdate", "onHoverStart", "onHoverEnd",
  "onTap", "onTapStart", "onTapCancel", "onPan", "onPanStart", "onPanEnd", "onPanSessionStart",
  "onDrag", "onDragStart", "onDragEnd", "onDirectionLock", "onDragTransitionEnd",
  "onLayoutAnimationStart", "onLayoutAnimationComplete", "onViewportEnter", "onViewportLeave",
  "onBeforeLayoutMeasure", "transformTemplate",
]);

type Value<T> = { get(): T; set(v: T): void; on(): () => void; stop(): void };
const isValue = (v: unknown): v is Value<unknown> =>
  typeof v === "object" && v !== null && typeof (v as Value<unknown>).get === "function";

function staticValue<T>(initial: T): Value<T> {
  let current = initial;
  return { get: () => current, set: (v) => { current = v; }, on: () => () => {}, stop: () => {} };
}

const TRANSFORMS = ["x", "y", "scale", "scaleX", "scaleY", "rotate"] as const;

// motion lets style hold motion values and transform shorthands (x, scale). Resolve them once.
function plainStyle(style: Record<string, unknown> | undefined) {
  if (!style) return style;
  const out: Record<string, unknown> = {};
  const transform: string[] = [];
  for (const [k, raw] of Object.entries(style)) {
    const v = isValue(raw) ? raw.get() : raw;
    if ((TRANSFORMS as readonly string[]).includes(k)) {
      if (k === "x" || k === "y") transform.push(`translate${k.toUpperCase()}(${typeof v === "number" ? `${v}px` : v})`);
      else if (k === "rotate") transform.push(`rotate(${typeof v === "number" ? `${v}deg` : v})`);
      else transform.push(`${k}(${v})`);
    } else out[k] = v;
  }
  if (transform.length) out.transform = [out.transform, ...transform].filter(Boolean).join(" ");
  return out;
}

const cache = new Map<string, unknown>();
function element(tag: string) {
  if (!cache.has(tag)) {
    const C = forwardRef<Element, Record<string, unknown>>(function StaticMotion(props, ref) {
      const dom: Record<string, unknown> = { ref };
      for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.has(k)) dom[k] = v;
      dom.style = plainStyle(props.style as Record<string, unknown> | undefined);
      return createElement(tag, dom);
    });
    C.displayName = `motion.${tag}`;
    cache.set(tag, C);
  }
  return cache.get(tag);
}

/** motion.div, motion.li, ...: the plain element. */
export const motion = new Proxy({}, { get: (_t, tag: string) => element(tag) }) as Record<string, unknown>;

/** Children appear and leave at once. */
export function AnimatePresence({ children }: { children?: ReactNode }) {
  return createElement(Fragment, null, children);
}

export function MotionConfig({ children }: { children?: ReactNode }) {
  return createElement(Fragment, null, children);
}

export function useMotionValue<T>(initial: T): Value<T> {
  return staticValue(initial);
}

/** The spring settles at once: the source value. */
export function useSpring<T>(source: Value<T> | T): Value<T> {
  return isValue(source) ? (source as Value<T>) : staticValue(source);
}

/** Only the function form (useTransform(() => ...)) is used here. */
export function useTransform<T>(fn: () => T): Value<T> {
  return { get: fn, set: () => {}, on: () => () => {}, stop: () => {} };
}

/** Jumps to the end value. */
export function animate<T>(value: Value<T>, to: T | T[]) {
  const end = Array.isArray(to) ? to[to.length - 1] : to;
  value.set(end);
  return { stop: () => {}, cancel: () => {}, complete: () => {}, then: (f?: () => void) => Promise.resolve().then(f) };
}
