import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { BRAND } from "@/lib/brand";
import { SITE } from "@/lib/site";
import "./globals.css";

// Inter carries the interface; Noto Sans Devanagari carries the place and
// occupant names, which are the only Marathi in the UI. Both are self-hosted by
// next/font, so there is no webfont request at runtime, and the fallback is
// metric-matched so the swap does not shift the layout.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari", "latin"],
  display: "swap",
  variable: "--font-devanagari",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  category: "reference",
  // Every search is a query string on "/", so all of them name one page.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    locale: "en_IN",
    alternateLocale: ["mr_IN"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
  // Survey and khata numbers are not phone numbers.
  formatDetection: { telephone: false, address: false },
  appleWebApp: { title: SITE.name, statusBarStyle: "default" },
  // The vector mark for every browser that takes one, a PNG for those that do
  // not; the Apple touch icon comes from `apple-icon.tsx`.
  icons: {
    icon: [
      { url: "/mark.svg", type: "image/svg+xml" },
      { url: "/icons/32.png", sizes: "32x32", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.paper },
    { media: "(prefers-color-scheme: dark)", color: BRAND.night },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${devanagari.variable}`}>
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
