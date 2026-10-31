/**
 * The public identity of the site, in one place, for metadata, the sitemap,
 * robots and structured data. `NEXT_PUBLIC_SITE_URL` overrides the origin for
 * another deployment.
 */
export const SITE = {
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://bhumi.pakhale.com").replace(/\/$/, ""),
  name: "Bhumi",
  tagline: "Maharashtra land records, fast",
  title: "Bhumi — 7/12, 8A & Property Card online | Maharashtra land records",
  description:
    "7/12 (सातबारा), 8A and Property Card from Mahabhulekh in seconds, and every survey number on a satellite map with its boundary and holders. Free, no login, on any phone.",
  keywords: [
    "7/12",
    "7/12 extract",
    "7/12 utara online",
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
    "gat number map",
    "survey number map",
    "land map maharashtra",
    "plot boundary",
    "bhunaksha",
    "bhu naksha maharashtra",
    "भू नकाशा",
    "kami jasti patrak",
  ],
} as const;
