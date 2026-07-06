import type { Metadata } from "next";
import { Poppins, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

/*
 * Brand typography.
 * The Autommerce brand font is "Uni Neue" (commercial). Until the licensed
 * .woff2 files are added to src/fonts/, we use Poppins as the closest free
 * match for the rounded-geometric display look, with Inter for UI body text.
 *
 * To switch to real Uni Neue later: drop the files in src/fonts/, replace the
 * Poppins import with `next/font/local`, and keep the `--font-display` variable.
 */
const displayFont = Poppins({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const bodyFont = Inter({
  variable: "--font-sans-body",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AutoShopping — AI Shopping Assistant by Autommerce",
  description:
    "AutoShopping by Autommerce gives your store an AI shopping assistant and virtual try-on that turn browsers into buyers. E-commerce with AI Excellence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${displayFont.variable} ${bodyFont.variable} ${geistMono.variable} h-full`}
    >
      <body className="h-full bg-mesh">{children}</body>
    </html>
  );
}
