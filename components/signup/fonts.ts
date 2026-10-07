import { Barlow_Condensed, Barlow_Semi_Condensed } from "next/font/google";

// Signup only: the approved mockups set questions in Barlow Condensed (big, readable in a truck).
export const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--su-cond",
  display: "swap",
});

export const barlowSemi = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--su-semi",
  display: "swap",
});
