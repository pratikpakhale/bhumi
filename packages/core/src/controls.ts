/** WebForms control names, grouped by the two distinct forms on the page. */

const P = "ctl00$ContentPlaceHolder1$";

/** Controls shared by the 7/12, 8A and Property Card flows. */
export const Standard = {
  ulpinRadio: `${P}rbtnULPIN`,
  typeRadio: `${P}rbtnSelectType`,
  district: `${P}ddlMainDist`,
  taluka: `${P}ddlTalForAll`,
  village: `${P}ddlVillForAll`,
  searchTypeRadio: `${P}rbtnSearchType`,
  searchType: `${P}ddlSelectSearchType`,
  numberInput: `${P}txtcsno`,
  nameInput: `${P}txtnames`,
  searchButton: `${P}btnsearchfind`,
  parcel: `${P}ddlsurveyno`,
  mobile: `${P}txtmobile1`,
  language: `${P}ddllangforAll`,
  captcha: `${P}txtcaptcha`,
  submit: `${P}btnmainsubmit`,
} as const;

/** Controls for the Kami Jasti Patrak (measurement-change) flow. */
export const Kjp = {
  ulpinRadio: `${P}rbtnULPIN`,
  typeRadio: `${P}rbtnSelectType`,
  district: `${P}ddlkpratdist`,
  taluka: `${P}ddltalukakprat`,
  village: `${P}ddlvillagekprat`,
  sankalan: `${P}ddlSankalan`, // survey scheme: भूमापन / नागरी भूमापन
  purpose: `${P}ddlMojaniUdesh`, // measurement purpose
  duration: `${P}ddlKalaWadhi`, // priority / turnaround band
  numberInput: `${P}txtMojaniKr`, // measurement (mojani) number
  mobile: `${P}txtmobileno`,
  language: `${P}ddlkpratlang`,
  captcha: `${P}txtcaptchakprat`,
  searchButton: `${P}btnKpratSearch`,
} as const;

/** `rbtnSelectType` value for each record type. */
export const TypeRadioValue = {
  "7/12": "SelectSatbara",
  "8A": "Select8A",
  PropertyCard: "SelectPC",
  KJP: "SelectKPrat",
} as const;

/** Default `rbtnULPIN` value: "I don't know the ULPIN" (the common path). */
export const ULPIN_NO = "Know-no";

/** `rbtnSearchType` values: search a parcel by number vs by occupant name. */
export const SearchModeRadio = {
  number: "17", // सर्वे/गट नंबर
  name: "18", // नाव
} as const;
