/**
 * The public identity of the site, in one place, for metadata, the sitemap,
 * robots and structured data. `NEXT_PUBLIC_SITE_URL` overrides the origin for
 * another deployment.
 */
export const SITE = {
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://bhumi.pakhale.com",
  name: "Bhumi",
  title: "Bhumi — 7/12, 8A & Property Card online | Maharashtra land records",
  description:
    "Look up Maharashtra land records from Mahabhulekh in seconds: 7/12 (सातबारा उतारा), 8A (८अ), Property Card (मिळकत पत्रिका) and Kami-Jasti Patrak. Search by survey number or owner name, on any phone.",
  keywords: [
    "7/12",
    "7/12 extract",
    "satbara utara",
    "सातबारा उतारा",
    "8A extract",
    "८अ उतारा",
    "property card",
    "मिळकत पत्रिका",
    "Mahabhulekh",
    "महाभूलेख",
    "bhulekh",
    "Maharashtra land records",
    "भूमि अभिलेख",
    "survey number search",
    "kami jasti patrak",
  ],
  /** Matches the light theme's paper and the accent, for icons and the manifest. */
  paper: "#f9f7f4",
  ink: "#1f1b17",
  accent: "#3b4fae",
} as const;
