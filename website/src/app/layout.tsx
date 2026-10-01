import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Inter, Poppins } from "next/font/google";
import { SmoothScroll } from "@/components/smooth-scroll";
import { site } from "@/lib/site";
import "@/styles/globals.css";

const display = Poppins({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display-family" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif-family" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans-family" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono-family" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: "Persona AI — Try it on before you buy it",
  description: site.description,
  openGraph: { title: "Persona AI — Try it on before you buy it", description: site.description, type: "website" },
  icons: { icon: "/brand/autommerce-white.png" },
};

const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('persona-theme');
      var theme = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.colorScheme = theme;
    } catch (e) {}
    if (/(?:^|;\\s*)persona_signed_in=1(?:;|$)/.test(document.cookie)) {
      document.documentElement.setAttribute('data-auth', 'in');
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${serif.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grain">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
