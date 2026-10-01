/**
 * High-level client for the Mahabhulekh portal.
 *
 * Mirrors the portal's own stateful flow: pick a record type, then cascade
 * district → taluka → village, then either search for a parcel (7/12, 8A,
 * Property Card) or supply measurement details (KJP), then fetch the rendered
 * document. Each step is a postback; this client tracks the accumulated form
 * state so every postback carries the fields the server expects.
 *
 * The visual captcha is answered automatically by reading the expected value
 * out of the ViewState (see `viewstate.ts`) — it offers no real protection.
 */

import { Session, type SessionOptions } from "./session.js";
import { Standard, Kjp, TypeRadioValue, ULPIN_NO, SearchModeRadio } from "./controls.js";
import {
  readOptions,
  realOptions,
  rawValue,
  hasControl,
  readAlerts,
  readServerErrors,
  isNoMatch,
  readEmbeddedRecord,
  readImageById,
  readDivById,
  absolutizeUrls,
} from "./html.js";
import { extractCaptcha } from "./viewstate.js";
import { MahabhulekhError } from "./types.js";
import type { Option, RecordType, RecordDocument } from "./types.js";

/** Within the standard flow, look up a parcel by number or by occupant name. */
export type SearchMode = "number" | "name";

/** Options available once a village is selected. */
export interface VillageContext {
  /** How to search within the village (7/12, 8A, PC). Empty for KJP. */
  searchTypes: Option[];
  /** Languages the record can be transliterated into. */
  languages: Option[];
  /** KJP-only classification dropdowns; empty for other record types. */
  kjp?: {
    sankalan: Option[];
    purpose: Option[];
    duration: Option[];
  };
}

export interface FetchRecordInput {
  /** Mobile number (10 digits, starting 6-9). Logged by the portal per access. */
  mobile: string;
  /** Language option value, e.g. `en_in` or `mr_in`. */
  language: string;
  /** Standard flow: the `ddlsurveyno` value chosen from {@link searchParcels}. */
  parcel?: string;
  /** KJP flow: the measurement (mojani) number. */
  measurementNumber?: string;
  /** KJP flow: `ddlSankalan` value. */
  sankalan?: string;
  /** KJP flow: `ddlMojaniUdesh` value. */
  purpose?: string;
  /** KJP flow: `ddlKalaWadhi` value. */
  duration?: string;
}

export class MahabhulekhClient {
  private readonly session: Session;
  private recordType: RecordType = "7/12";
  private searchMode: SearchMode = "number";
  /** Accumulated control values resent on every postback. */
  private form: Record<string, string> = {};

  constructor(opts: SessionOptions = {}) {
    this.session = new Session(opts);
  }

  private get isKjp(): boolean {
    return this.recordType === "KJP";
  }

  private get controls() {
    return this.isKjp ? Kjp : Standard;
  }

  /** The common fields every postback in the current flow must include. */
  private base(): Record<string, string> {
    const c = this.controls;
    return {
      [c.ulpinRadio]: ULPIN_NO,
      [c.typeRadio]: TypeRadioValue[this.recordType],
      ...(this.isKjp ? {} : { [Standard.searchTypeRadio]: SearchModeRadio[this.searchMode] }),
      ...this.form,
    };
  }

  /**
   * Record a dropdown choice, spelled exactly as the current page offers it —
   * callers see trimmed values, the portal validates the untrimmed original.
   */
  private choose(control: string, value: string): void {
    this.form[control] = rawValue(this.session.html, control, value);
  }

  /** Open a session for the given record type and return the district list. */
  async start(recordType: RecordType): Promise<Option[]> {
    this.recordType = recordType;
    this.searchMode = "number";
    this.form = {};
    await this.session.open();
    // Selecting the record type is itself a postback that reshapes the form.
    if (recordType !== "7/12") {
      await this.session.postback(
        {
          [Standard.ulpinRadio]: ULPIN_NO,
          [Standard.typeRadio]: TypeRadioValue[recordType],
        },
        Standard.typeRadio,
      );
    }
    return realOptions(readOptions(this.session.html, this.controls.district));
  }

  async selectDistrict(value: string): Promise<Option[]> {
    const c = this.controls;
    this.choose(c.district, value);
    await this.session.postback(this.base(), c.district);
    return realOptions(readOptions(this.session.html, c.taluka));
  }

  async selectTaluka(value: string): Promise<Option[]> {
    const c = this.controls;
    this.choose(c.taluka, value);
    await this.session.postback(this.base(), c.taluka);
    return realOptions(readOptions(this.session.html, c.village));
  }

  async selectVillage(value: string): Promise<VillageContext> {
    const c = this.controls;
    this.searchMode = "number";
    this.choose(c.village, value);
    await this.session.postback(this.base(), c.village);
    const html = this.session.html;
    const languages = realOptions(readOptions(html, c.language));
    if (this.isKjp) {
      return {
        searchTypes: [],
        languages,
        kjp: {
          sankalan: realOptions(readOptions(html, Kjp.sankalan)),
          purpose: realOptions(readOptions(html, Kjp.purpose)),
          duration: realOptions(readOptions(html, Kjp.duration)),
        },
      };
    }
    return {
      searchTypes: realOptions(readOptions(html, Standard.searchType)),
      languages,
    };
  }

  /**
   * Standard flow only: switch between looking up a parcel by number
   * (survey/gat) or by occupant name. Toggling `rbtnSearchType` is a postback
   * that reshapes the form; returns the sub-type options for the chosen mode
   * (e.g. survey vs "akshari" survey for number; first/middle/surname/full for
   * name).
   */
  async setSearchMode(mode: SearchMode): Promise<Option[]> {
    if (this.isKjp) {
      throw new MahabhulekhError("Name/number search is not available for the KJP flow.");
    }
    if (mode !== this.searchMode) {
      this.searchMode = mode;
      // Drop stale search inputs so the other mode's field isn't resent.
      delete this.form[Standard.searchType];
      delete this.form[Standard.numberInput];
      delete this.form[Standard.nameInput];
      await this.session.postback(this.base(), Standard.searchTypeRadio);
    }
    return realOptions(readOptions(this.session.html, Standard.searchType));
  }

  /**
   * Standard flow only: search for parcels within the selected village.
   * `searchType` is a sub-type value from {@link setSearchMode} (or the
   * `searchTypes` returned by {@link selectVillage}); `query` is a survey/gat
   * number in number mode, or a name fragment in name mode. Returns the
   * matching `ddlsurveyno` options.
   */
  async searchParcels(searchType: string, query: string): Promise<Option[]> {
    if (this.isKjp) {
      throw new MahabhulekhError("searchParcels is not available for the KJP flow.");
    }
    // Selecting the sub-type is an autopostback that must land before the
    // search, otherwise the server discards the query (notably for names).
    this.choose(Standard.searchType, searchType);
    delete this.form[Standard.numberInput];
    delete this.form[Standard.nameInput];
    await this.session.postback(this.base(), Standard.searchType);

    // Some sub-types take no query: "akshari" (survey numbers written in
    // words) lists every such parcel and renders no text box. Posting a value
    // for a control that is not on the page corrupts the server's view of the
    // form for the rest of the session, so only send what the page shows.
    const inputField = this.searchMode === "name" ? Standard.nameInput : Standard.numberInput;
    if (hasControl(this.session.html, inputField)) this.form[inputField] = query.trim();
    await this.session.postback({
      ...this.base(),
      [Standard.searchButton]: "शोधा(Search)",
    });
    const parcels = realOptions(readOptions(this.session.html, Standard.parcel));
    if (parcels.length === 0) {
      const [reason] = readAlerts(this.session.html);
      // A search with no match is raised as an exception ("check the name",
      // "no akshari numbers here"); it is an empty result, not a failure.
      if (reason && !isFinished(reason) && !isNoMatch(reason)) {
        // An empty result is an answer; a server exception is not.
        const failed = readServerErrors(this.session.html).length > 0;
        throw new MahabhulekhError(
          failed ? "Mahabhulekh failed to run the search. Please try again." : reason,
          [reason],
          failed,
        );
      }
    }
    return parcels;
  }

  /** Fetch the rendered record document. */
  async fetchRecord(input: FetchRecordInput): Promise<RecordDocument> {
    return this.isKjp ? this.fetchKjp(input) : this.fetchStandard(input);
  }

  private async fetchStandard(input: FetchRecordInput): Promise<RecordDocument> {
    if (!input.parcel) {
      throw new MahabhulekhError("A parcel (survey/gat number) is required.");
    }
    // 1) Select the parcel — an autopostback that primes the record on the server.
    this.choose(Standard.parcel, input.parcel);
    await this.session.postback(this.base(), Standard.parcel);

    // 2) Answer the captcha and submit. The portal renders the record to an
    // image on its own disk, and that step fails often and at random: the
    // response then carries no document, a "file in use" exception, or the
    // record as HTML smuggled out in an error alert. Resubmitting the same
    // form on the same session is what a user pressing Submit again does, and
    // usually succeeds — so do that a few times, keeping any HTML copy as the
    // fallback.
    let fallback: RecordDocument | null = null;
    let lastError: MahabhulekhError | null = null;
    for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
      const captcha = extractCaptcha(this.session.viewState);
      if (!captcha) throw new MahabhulekhError("Could not read the captcha token from ViewState.");
      this.choose(Standard.language, input.language);
      await this.session.postback({
        ...this.base(),
        [Standard.mobile]: input.mobile,
        [Standard.captcha]: captcha,
        [Standard.submit]: "Submit",
      });
      try {
        return this.extractDocument();
      } catch (err) {
        if (!(err instanceof MahabhulekhError) || !err.retryable) throw err;
        lastError = err;
      }
      const embedded = readEmbeddedRecord(this.session.html);
      if (embedded) {
        fallback ??= this.htmlDocument(embedded);
        // One more try for the image, then settle for the HTML copy.
        if (attempt >= 1) break;
      }
    }
    if (fallback) return fallback;
    throw lastError ?? new MahabhulekhError("The portal did not return a record document.");
  }

  /**
   * KJP mirrors the browser exactly: each classification dropdown is an
   * autopostback that must land, in order, before the next is set, and the
   * language change (with number and mobile already filled in) is one too.
   * Submitting everything in a single post is rejected as an invalid mobile
   * number.
   */
  private async fetchKjp(input: FetchRecordInput): Promise<RecordDocument> {
    if (!input.measurementNumber) {
      throw new MahabhulekhError("A measurement (mojani) number is required for KJP.");
    }
    const steps: [string, string | undefined][] = [
      [Kjp.sankalan, input.sankalan],
      [Kjp.purpose, input.purpose],
      [Kjp.duration, input.duration],
    ];
    for (const [control, value] of steps) {
      if (!value) throw new MahabhulekhError("Choose the survey scheme, purpose and priority.");
      this.choose(control, value);
      await this.session.postback(this.base(), control);
    }
    this.form[Kjp.numberInput] = input.measurementNumber.trim();
    this.form[Kjp.mobile] = input.mobile;
    this.choose(Kjp.language, input.language);
    await this.session.postback(this.base(), Kjp.language);

    const captcha = extractCaptcha(this.session.viewState);
    if (!captcha) throw new MahabhulekhError("Could not read the captcha token from ViewState.");
    await this.session.postback({
      ...this.base(),
      [Kjp.captcha]: captcha,
      [Kjp.searchButton]: "शोधा(Search)",
    });
    return this.extractDocument();
  }

  /**
   * Record rendering varies by type: 7/12 and Property Card come back as a
   * JPEG inside `ImgPC`; 8A and KJP render an HTML table inside a popup div.
   * Try the image first, then the known HTML containers.
   */
  private extractDocument(): RecordDocument {
    const html = this.session.html;

    const img = readImageById(html, "ImgPC");
    if (img && img.base64.length > 5000) {
      return {
        recordType: this.recordType,
        format: "image",
        mimeType: img.mime,
        imageBase64: img.base64,
        dataUri: `data:${img.mime};base64,${img.base64}`,
      };
    }

    for (const idPart of ["showPopUp1", "showPopUp", "kpratreport", "krushik"]) {
      const fragment = readDivById(html, idPart);
      if (fragment && /<table/i.test(fragment)) return this.htmlDocument(fragment);
    }

    throw failureFrom(html);
  }

  private htmlDocument(fragment: string): RecordDocument {
    return {
      recordType: this.recordType,
      format: "html",
      html: absolutizeUrls(fragment, this.session.url),
    };
  }
}

/** How many times to submit a 7/12 / Property Card request before giving up. */
const FETCH_ATTEMPTS = 3;

/** The portal's "request handled" alert, which carries no information. */
const isFinished = (alert: string): boolean => /^finished\b/i.test(alert.trim());

/**
 * Why a submit produced no document, as an error the caller can show.
 *
 * A plain alert is the portal's answer about the request (bad mobile number,
 * no such record) and is final. A server exception, or silence, is the portal
 * failing — those are marked retryable and phrased for people, keeping the
 * raw text in `alerts`.
 */
function failureFrom(html: string): MahabhulekhError {
  const serverErrors = readServerErrors(html);
  const alerts = readAlerts(html).filter((a) => !isFinished(a));
  if (serverErrors.length > 0) {
    const raw = serverErrors[0]!;
    const message = /unable to connect to the remote server/i.test(raw)
      ? "Mahabhulekh's records service is not responding right now. Please try again later."
      : "Mahabhulekh failed to produce this record. Please try again.";
    return new MahabhulekhError(message, serverErrors, true);
  }
  if (alerts.length > 0) return new MahabhulekhError(alerts[0]!, alerts);
  return new MahabhulekhError(
    "Mahabhulekh did not return the record this time. Please try again.",
    [],
    true,
  );
}

/** A search result row's label, taken apart. */
export interface ParcelLabel {
  /** The holder's name, when the row came from a name search. */
  name: string | null;
  /** The number in parentheses: the survey number (7/12, PC) or khata (8A). */
  number: string | null;
  /** The number in square brackets, when present: the 7/12 khata number. */
  account: string | null;
}

/**
 * Split a name-search row such as `काशिनाथ तुकाराम गडदे ( 1 ) [ 23 ]` into
 * name, number and account. Number-search rows are bare numbers and come back
 * as `{ name: null, number: <label>, account: null }`.
 */
export function parseParcelLabel(label: string): ParcelLabel {
  const text = label.replace(/\s+/g, " ").trim();
  const m = text.match(/^(.*?)\s*\(\s*([^()]*?)\s*\)\s*(?:\[\s*([^\]]*?)\s*\])?$/);
  if (!m) return { name: null, number: text || null, account: null };
  return { name: m[1] || null, number: m[2] || null, account: m[3] || null };
}
