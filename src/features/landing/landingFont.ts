import localFont from "next/font/local";

export const landingSans = localFont({
  src: "./fonts/Manrope-Variable.woff2",
  weight: "400 800",
  style: "normal",
  display: "swap",
  variable: "--font-landing-sans",
  fallback: ["Arial", "sans-serif"],
});

export const landingDisplay = localFont({
  src: "./fonts/Petrona-Italic.woff2",
  weight: "400 600",
  style: "italic",
  display: "swap",
  variable: "--font-landing-serif",
  fallback: ["Georgia", "Times New Roman"],
});
