import type { Metadata, Viewport } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

// GDD §22.2: Space Grotesk (600, 700) for display, Manrope (400, 600, 800) for body.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "Football Puzzle Battle",
  description:
    "Race your opponent to solve visual football puzzles. Buzz early, score big.",
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
