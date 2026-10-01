/** Public types for the Mahabhulekh client. */

/** A selectable option from a cascading dropdown (district / taluka / village / survey). */
export interface Option {
  /** The `value` posted back to the server. */
  value: string;
  /** The human-readable label (Marathi as served by the portal). */
  label: string;
}

/** The four record types the portal exposes. */
export type RecordType =
  | "7/12" // Satbara / Village Form VII+XII (सातबारा)
  | "8A" // Village Form VIII-A (holding statement)
  | "PropertyCard" // Property Card (मिळकत पत्रिका)
  | "KJP"; // Kami Jasti Patrak — measurement change register (कमी जास्त पत्रक)

/** How the parcel is looked up within a village (varies by record type). */
export interface SearchTypeOption extends Option {}

/**
 * A rendered land-record document. Depending on the record type the portal
 * returns either a generated image (7/12 and Property Card come back as a
 * single JPEG with QR + watermark) or an HTML fragment (8A and KJP render a
 * table). This is a discriminated union on {@link RecordDocument.format}.
 */
export type RecordDocument = ImageRecord | HtmlRecord;

interface RecordBase {
  recordType: RecordType;
}

/** A record returned as a rendered image (7/12, Property Card). */
export interface ImageRecord extends RecordBase {
  format: "image";
  /** MIME type of {@link imageBase64}, e.g. `image/jpeg`. */
  mimeType: string;
  /** Base64-encoded image payload (no data-URI prefix). */
  imageBase64: string;
  /** Convenience data-URI: `data:<mime>;base64,<payload>`. */
  dataUri: string;
}

/** A record returned as an HTML fragment (8A, KJP). */
export interface HtmlRecord extends RecordBase {
  format: "html";
  /** Sanitized-ish HTML fragment with relative asset URLs made absolute. */
  html: string;
}

/** Language the record can be transliterated into. */
export interface LanguageOption extends Option {}

/** Anything the portal reports as a user-facing error (alerts, validation). */
export class MahabhulekhError extends Error {
  constructor(
    message: string,
    /** Raw alert / reason strings surfaced by the portal, if any. */
    public readonly alerts: string[] = [],
    /**
     * True when the failure is the portal being unwell (timeouts, dropped
     * connections, its own server errors) rather than an answer about the
     * request, so the same request is worth trying again.
     */
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "MahabhulekhError";
  }
}
