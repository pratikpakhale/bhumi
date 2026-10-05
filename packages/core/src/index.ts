/**
 * The browser-safe half of the library: types, errors and pure helpers. The
 * network clients need Node and live in `@bhumi/core/server`.
 */

export { parseParcelLabel } from "./parcel.js";
export type { ParcelLabel } from "./parcel.js";
export type { VillageContext, FetchRecordInput, SearchMode } from "./client.js";
export type { SessionOptions } from "./session.js";
export { parseEightA, normalizeDigits, surveyBase } from "./eightA.js";
export type { EightAHolding } from "./eightA.js";
export { bhunakshaCode, matchPlot, parsePlotInfo } from "./map.js";
export type { Bounds, MapPlot, PlotHolding, VillageMap } from "./map.js";
export type { BhunakshaOptions } from "./bhunaksha.js";
export { MahabhulekhError } from "./types.js";
export type {
  Option,
  RecordType,
  RecordDocument,
  SearchTypeOption,
  LanguageOption,
} from "./types.js";
