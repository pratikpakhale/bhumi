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
    "Look up Maharashtra land records from Mahabhulekh in seconds: 7/12 (सातबारा उतारा), 8A (८अ), Property Card (मिळकत पत्रिका) and Kami-Jasti Patrak. Search by survey number or owner name, see the plot on a satellite map, and keep the records you need — free, on any phone.",
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
    "bhunaksha",
    "kami jasti patrak",
  ],
} as const;
