// Redesign (v2): its own fonts, tokens and header, under /v2 so the current screens stay untouched.
import { Inter, JetBrains_Mono } from "next/font/google";
import "./theme.css";

const inter = Inter({ variable: "--font-v2-sans", subsets: ["latin", "latin-ext"] });
const mono = JetBrains_Mono({ variable: "--font-v2-mono", subsets: ["latin", "latin-ext"] });

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <div className={`v2 ${inter.variable} ${mono.variable} flex min-h-full flex-col`}>{children}</div>;
}
