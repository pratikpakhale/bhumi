/**
 * A live WebForms session against the Mahabhulekh portal.
 *
 * The portal is a single ASP.NET WebForms page driven entirely by full-page
 * postbacks. Every interaction (choosing a district, a taluka, pressing
 * search) is a POST that echoes back the whole page with a fresh
 * `__VIEWSTATE`. This class tracks the cookies and the three hidden state
 * fields, and exposes `get()` / `postback()` primitives that the higher-level
 * flows build on.
 */

import { readField } from "./html.js";
import { MahabhulekhError } from "./types.js";

const DEFAULT_BASE_URL = "https://bhulekh.mahabhumi.gov.in/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export interface SessionOptions {
  baseUrl?: string;
  /** Injected for testing; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Per-request ceiling, in ms. The portal normally answers in 1-5s but can
   * hold a connection open for minutes; without a ceiling one stuck postback
   * hangs the whole flow. Defaults to 45s.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;

/** The three hidden fields ASP.NET requires on every postback. */
interface HiddenState {
  __VIEWSTATE: string;
  __VIEWSTATEGENERATOR: string;
  __EVENTVALIDATION: string;
}

export class Session {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cookies = new Map<string, string>();
  private state: HiddenState | null = null;
  /** The HTML from the most recent request. */
  private lastHtml = "";

  constructor(opts: SessionOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get html(): string {
    return this.lastHtml;
  }

  get url(): string {
    return this.baseUrl;
  }

  /** The expected captcha answer, read from the current ViewState. */
  get viewState(): string {
    return this.state?.__VIEWSTATE ?? "";
  }

  /** Load the initial page and capture cookies + hidden state. */
  async open(): Promise<string> {
    const res = await this.request(this.baseUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    await this.absorb(res);
    return this.lastHtml;
  }

  /**
   * The portal is slow (~5s/request) and intermittently drops connections.
   * Retry transient network failures a couple of times before giving up.
   *
   * Only failures where no response arrived are retried. A timeout is not: a
   * postback that timed out may still have landed server-side, and replaying it
   * against a ViewState the server has moved past would only compound the
   * confusion — the caller is better off starting a fresh session.
   */
  private async request(url: string, init: RequestInit): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (err) {
        if (isTimeout(err)) {
          throw new MahabhulekhError("Mahabhulekh did not respond in time. Please try again.", [], true);
        }
        lastErr = err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw new MahabhulekhError(
      "Could not reach Mahabhulekh. The portal may be down; please try again shortly.",
      [String((lastErr as Error)?.message ?? lastErr)],
      true,
    );
  }

  /**
   * Perform a postback. `fields` are the control values to submit; the hidden
   * state fields are merged in automatically. Pass `eventTarget` for the
   * `__doPostBack` control that triggered it (dropdown changes, radios), or
   * omit it for a real submit button (include the button's name in `fields`).
   */
  async postback(
    fields: Record<string, string>,
    eventTarget = "",
    eventArgument = "",
  ): Promise<string> {
    if (!this.state) throw new Error("Session not opened; call open() first.");
    const body = new URLSearchParams({
      __EVENTTARGET: eventTarget,
      __EVENTARGUMENT: eventArgument,
      __VIEWSTATE: this.state.__VIEWSTATE,
      __VIEWSTATEGENERATOR: this.state.__VIEWSTATEGENERATOR,
      __EVENTVALIDATION: this.state.__EVENTVALIDATION,
      ...fields,
    });
    const res = await this.request(this.baseUrl, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        Referer: this.baseUrl,
        Cookie: this.cookieHeader(),
      },
      body: body.toString(),
    });
    await this.absorb(res);
    return this.lastHtml;
  }

  /**
   * Take in a response: cookies, body and the fresh hidden state.
   *
   * A page without ViewState is the portal's generic ASP.NET error page (it
   * serves those with a 200 as often as a 500). Carrying on would post the
   * *previous* page's state against a session the server has already thrown
   * away, so it is surfaced here instead of as a baffling failure three steps
   * later.
   */
  private async absorb(res: Response): Promise<void> {
    this.absorbCookies(res);
    const html = await res.text();
    const vs = readField(html, "__VIEWSTATE");
    const gen = readField(html, "__VIEWSTATEGENERATOR");
    const ev = readField(html, "__EVENTVALIDATION");
    if (!vs || !gen || !ev) {
      throw new MahabhulekhError(
        res.status >= 500 || /Server Error|Runtime Error/i.test(html)
          ? "Mahabhulekh returned a server error. Please try again."
          : "Mahabhulekh returned an unexpected page. Please try again.",
        [],
        true,
      );
    }
    this.lastHtml = html;
    this.state = { __VIEWSTATE: vs, __VIEWSTATEGENERATOR: gen, __EVENTVALIDATION: ev };
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private absorbCookies(res: Response): void {
    const setCookies =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const pair = raw.split(";", 1)[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

const isTimeout = (err: unknown): boolean =>
  err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
