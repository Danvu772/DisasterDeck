// shadcn/ui's class helper: merge Tailwind classes, later ones win. Used by components/ui.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
