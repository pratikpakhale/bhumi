import { describe, expect, it } from "vitest";
import {
  absolutizeUrls,
  decodeEntities,
  readAlerts,
  readDivById,
  readField,
  readImageById,
  readOptions,
  realOptions,
  rawValue,
  hasControl,
  cleanText,
  readServerErrors,
  readEmbeddedRecord,
} from "./html.js";

describe("decodeEntities", () => {
  it("decodes the entities the portal actually emits", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;&nbsp;f")).toBe(
      `a & b <c> "d" 'e' f`,
    );
  });

  it("decodes numeric entities", () => {
    expect(decodeEntities("a&#160;b&#xA0;c")).toBe("a\u00A0b\u00A0c");
  });

  it("leaves unknown entities alone", () => {
    expect(decodeEntities("&copy; 2026")).toBe("&copy; 2026");
  });
});

describe("readField", () => {
  const html = `<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="abc/123+xyz==" />`;

  it("reads a hidden field by id", () => {
    expect(readField(html, "__VIEWSTATE")).toBe("abc/123+xyz==");
  });

  it("decodes entities in the value", () => {
    expect(readField(`<input id="x" value="a &amp; b" />`, "x")).toBe("a & b");
  });

  it("returns null when the field is missing", () => {
    expect(readField(html, "__EVENTVALIDATION")).toBeNull();
  });

  it("does not treat the id as a regex", () => {
    expect(readField(`<input id="a.c" value="1">`, "abc")).toBeNull();
  });
});

describe("readOptions", () => {
  const select = `
    <select name="ctl00$ddlMainDist" id="ddlMainDist">
      <option value="">--निवडा--</option>
      <option value="25">पुणे</option>
      <option value="35" selected="selected">रत्नागिरी</option>
      <option value="a&amp;b">A &amp; B</option>
    </select>`;

  it("reads value/label pairs from a select addressed by name", () => {
    expect(readOptions(select, "ctl00$ddlMainDist")).toEqual([
      { value: "", label: "--निवडा--" },
      { value: "25", label: "पुणे" },
      { value: "35", label: "रत्नागिरी" },
      { value: "a&b", label: "A & B" },
    ]);
  });

  it("returns an empty list when the select is absent", () => {
    expect(readOptions(select, "ctl00$nope")).toEqual([]);
  });

  it("stops at the closing tag rather than swallowing a later select", () => {
    const two = `${select}<select name="other"><option value="9">nine</option></select>`;
    expect(readOptions(two, "ctl00$ddlMainDist").map((o) => o.value)).not.toContain("9");
  });

  it("strips nested markup from labels", () => {
    const nested = `<select name="s"><option value="1"><b>Bold</b> label</option></select>`;
    expect(readOptions(nested, "s")).toEqual([{ value: "1", label: "Bold label" }]);
  });
});

describe("realOptions", () => {
  it("drops placeholder rows but keeps real ones", () => {
    expect(
      realOptions([
        { value: "", label: "--निवडा--" },
        { value: "--निवडा--", label: "choose" },
        { value: "0", label: "--select--" },
        { value: "25", label: "पुणे" },
      ]),
    ).toEqual([{ value: "25", label: "पुणे" }]);
  });

  it("keeps the first of a repeated value, in order", () => {
    expect(
      realOptions([
        { value: "1918", label: "पाटील गणपत" },
        { value: "1920", label: "जाधव सुनिता" },
        { value: "1918", label: "पाटील गणपत रामभाऊ" },
      ]),
    ).toEqual([
      { value: "1918", label: "पाटील गणपत" },
      { value: "1920", label: "जाधव सुनिता" },
    ]);
  });
});

describe("cleanText", () => {
  it("collapses padding, zero-width characters and tags", () => {
    expect(cleanText(" पाहिले&#160; <b>नाव</b>\u200B ")).toBe("पाहिले नाव");
  });
});

describe("realOptions: portal quirks", () => {
  it("trims values and drops the KJP and name-search placeholders", () => {
    expect(
      realOptions([
        { value: "0", label: "Select Option" },
        { value: "नाव तपासुन पहा", label: "नाव तपासुन पहा" },
        { value: "272500060309180000  ", label: "आंबेगाव" },
      ]),
    ).toEqual([{ value: "272500060309180000", label: "आंबेगाव" }]);
  });
});

describe("rawValue", () => {
  const html = `<select name="v"><option value="27  ">A</option></select>`;

  it("maps a trimmed value back to the portal's spelling", () => {
    expect(rawValue(html, "v", "27")).toBe("27  ");
  });

  it("falls back to the value given", () => {
    expect(rawValue(html, "missing", "27")).toBe("27");
  });
});

describe("hasControl", () => {
  it("detects a rendered control by name", () => {
    expect(hasControl(`<input name="a$txt" />`, "a$txt")).toBe(true);
    expect(hasControl(`<input name="a$other" />`, "a$txt")).toBe(false);
  });
});

describe("readServerErrors", () => {
  it("picks out alerts carrying the exception handler's dotted tail", () => {
    const html = `<script>alert('Unable to connect to the remote server ...................!')</script>
      <script>alert('finished')</script>`;
    expect(readServerErrors(html)).toEqual(["Unable to connect to the remote server"]);
  });
});

describe("readEmbeddedRecord", () => {
  it("recovers a record rendered into an error alert", () => {
    const html = `<script>alert('<head><style>td{}</style></head><table><tr><td>७/१२</td></tr></table> ...................!');</script>`;
    expect(readEmbeddedRecord(html)).toBe(
      `<head><style>td{}</style></head><table><tr><td>७/१२</td></tr></table>`,
    );
  });

  it("ignores plain alerts", () => {
    expect(readEmbeddedRecord(`<script>alert('finished')</script>`)).toBeNull();
  });
});

describe("readAlerts", () => {
  it("ignores the page's own double-quoted validation alerts and embedded markup", () => {
    const html = `<script>function v(){ alert("Please enter a valid mobile number!"); }</script>
      <script>alert('<table></table> .....!')</script>
      <script>alert('Unable to connect ...................!')</script>`;
    expect(readAlerts(html)).toEqual(["Unable to connect"]);
  });

  it("collects the portal's startup alert messages", () => {
    const html = `
      <script>alert('Please enter valid mobile number');</script>
      <script>alert('finished');</script>`;
    expect(readAlerts(html)).toEqual(["Please enter valid mobile number", "finished"]);
  });

  it("returns an empty list when there are none", () => {
    expect(readAlerts("<html><body>ok</body></html>")).toEqual([]);
  });
});

describe("readImageById", () => {
  it("reads the record image by partial id", () => {
    const html = `<img id="ContentPlaceHolder1_ImgPC" src="data:image/jpeg;base64,AAECAwQ=" />`;
    expect(readImageById(html, "ImgPC")).toEqual({ mime: "image/jpeg", base64: "AAECAwQ=" });
  });

  it("normalises jpg to jpeg", () => {
    const html = `<img id="x_ImgPC_y" src="data:image/jpg;base64,QQ==">`;
    expect(readImageById(html, "ImgPC")?.mime).toBe("image/jpeg");
  });

  it("returns null for a non-data src", () => {
    const html = `<img id="ContentPlaceHolder1_ImgPC" src="/images/spinner.gif">`;
    expect(readImageById(html, "ImgPC")).toBeNull();
  });

  it("returns null when no such image exists", () => {
    expect(readImageById(`<img id="other" src="data:image/png;base64,QQ==">`, "ImgPC")).toBeNull();
  });
});

describe("readDivById", () => {
  it("captures the whole region across nested divs", () => {
    const html = `<div id="ContentPlaceHolder1_showPopUp1"><div class="a">one</div><div>two</div></div><div>after</div>`;
    expect(readDivById(html, "showPopUp1")).toBe(`<div class="a">one</div><div>two</div>`);
  });

  it("does not stop at the first closing tag", () => {
    const html = `<div id="rec"><div><div>deep</div></div></div>`;
    expect(readDivById(html, "rec")).toBe(`<div><div>deep</div></div>`);
  });

  it("returns null when the div is absent", () => {
    expect(readDivById(`<div id="other">x</div>`, "showPopUp1")).toBeNull();
  });
});

describe("absolutizeUrls", () => {
  const base = "https://bhulekh.mahabhumi.gov.in/";

  it("rewrites relative asset urls", () => {
    expect(absolutizeUrls(`<img src="images/logo.png">`, base)).toBe(
      `<img src="https://bhulekh.mahabhumi.gov.in/images/logo.png">`,
    );
  });

  it("rewrites relative CSS url()s", () => {
    expect(absolutizeUrls(`<td style="background:url('Images/wm.png')">`, base)).toBe(
      `<td style="background:url('https://bhulekh.mahabhumi.gov.in/Images/wm.png')">`,
    );
  });

  it("leaves absolute, data, protocol-relative and anchor urls alone", () => {
    const fragment = `<a href="https://x.test/a"></a><img src="data:image/png;base64,QQ=="><a href="#top"></a><img src="//cdn.test/x.png">`;
    expect(absolutizeUrls(fragment, base)).toBe(fragment);
  });
});
