import { describe, expect, it } from "vitest";
import { BhunakshaClient } from "./bhunaksha.js";
import { bhunakshaCode, matchPlot, parsePlotInfo } from "./map.js";

describe("bhunakshaCode", () => {
  it("pads Mahabhulekh's district and taluka onto the shared village code", () => {
    expect(bhunakshaCode("25", "2", "272500020303060000")).toBe("RVM2502272500020303060000");
  });
});

describe("matchPlot", () => {
  const drawn = ["1", "1/B", "105", "131", "160/1"];

  it("prefers the exact number", () => {
    expect(matchPlot("105", drawn)).toBe("105");
  });

  it("falls back to the most specific drawn parent", () => {
    expect(matchPlot("131/1/अ", drawn)).toBe("131");
    expect(matchPlot("160/1/ब/2", drawn)).toBe("160/1");
  });

  it("reads Devanagari digits", () => {
    expect(matchPlot("१०५", drawn)).toBe("105");
  });

  it("answers null for a number the map does not draw", () => {
    expect(matchPlot("999", drawn)).toBeNull();
  });
});

describe("parsePlotInfo", () => {
  const info =
    "Survey No. : 131/1/अ\nTotal Area : 0.2600\nPot kharaba : 0.0000\nOwner Name : जानकू तुकाराम शेळके, संतोष तुकाराम शेळके\nKhata No. : 103\n---------------------------------\n" +
    "Survey No. : 131/2\nTotal Area : 2.6300\nPot kharaba : 0.1200\nOwner Name : महाराष्ट्र शासन खाजगी वन विभाग\nKhata No. : 96\n---------------------------------\n";

  it("reads one holding per khata block", () => {
    expect(parsePlotInfo(info)).toEqual([
      {
        survey: "131/1/अ",
        khata: "103",
        areaHa: 0.26,
        potKharabaHa: 0,
        owners: ["जानकू तुकाराम शेळके", "संतोष तुकाराम शेळके"],
      },
      { survey: "131/2", khata: "96", areaHa: 2.63, potKharabaHa: 0.12, owners: ["महाराष्ट्र शासन खाजगी वन विभाग"] },
    ]);
  });

  it("answers nothing for a plot with no records", () => {
    expect(parsePlotInfo("")).toEqual([]);
  });
});

describe("BhunakshaClient", () => {
  /** A fake service: a firewall that hands out a cookie once, then a plot. */
  function fake() {
    const calls: { url: string; cookie: string }[] = [];
    const fetchImpl = (async (input: URL, init: RequestInit) => {
      const cookie = (init.headers as Record<string, string>).Cookie ?? "";
      calls.push({ url: String(input), cookie });
      if (!cookie) {
        return new Response(null, { status: 302, headers: { "Set-Cookie": "fw=1; Path=/; httpOnly" } });
      }
      if (String(input).endsWith("getPlotInfo")) {
        return Response.json({
          plotid: "p1",
          plotno: "105",
          area: 3256.25,
          xmin: 365646.5553,
          ymin: 2114199.0971,
          xmax: 365718.6745,
          ymax: 2114281.3397,
          the_geom:
            "MULTIPOLYGON(((365715.1373 2114234.4663,365718.6745 2114199.0971,365646.5553 2114257.9873,365657.3093 2114281.3397,365715.1373 2114234.4663)))",
          info: "Survey No. : 105/1\nTotal Area : 0.3256\nOwner Name : राम पाटील\nKhata No. : 12\n-----\n",
        });
      }
      const body = new URLSearchParams(String(init.body ?? ""));
      if (String(input).endsWith("getPlotAtXY")) {
        // Inside the plot only when asked in zone 43's metres.
        const x = Number(body.get("x"));
        const y = Number(body.get("y"));
        const inside = x > 365646 && x < 365719 && y > 2114199 && y < 2114282;
        return inside ? Response.json({ id: "p1", kide: "105" }) : new Response(null, { status: 204 });
      }
      if (String(input).endsWith("getVVVVExtentGeoref") && body.get("srs") === "0") {
        return Response.json({ xmin: 365646.5553, ymin: 2114199.0971, xmax: 365718.6745, ymax: 2114281.3397 });
      }
      return Response.json({
        xmin: 73.72266841260186,
        ymin: 19.11641495213184,
        xmax: 73.7233596469933,
        ymax: 19.117162796950566,
      });
    }) as unknown as typeof fetch;
    return { calls, client: new BhunakshaClient({ fetchImpl }) };
  }

  it("passes the firewall and reprojects the plot out of UTM", async () => {
    const { calls, client } = fake();
    const plot = await client.plot("RVM2502272500020303060000", "105");

    expect(calls[0]!.cookie).toBe("");
    expect(calls.slice(1).every((c) => c.cookie === "fw=1")).toBe(true);
    expect(plot?.number).toBe("105");
    expect(plot?.areaSqm).toBe(3256.25);
    const [w, s, e, n] = plot!.bounds;
    // Zone 43N: the reprojected outline lands on the service's own extent.
    expect(w).toBeCloseTo(73.72267, 4);
    expect(s).toBeCloseTo(19.11641, 4);
    expect(e).toBeCloseTo(73.72335, 4);
    expect(n).toBeCloseTo(19.11716, 4);
    expect(plot?.holdings).toEqual([
      { survey: "105/1", khata: "12", areaHa: 0.3256, potKharabaHa: null, owners: ["राम पाटील"] },
    ]);
  });

  it("finds the village's UTM zone and the plot under a point", async () => {
    const { client } = fake();
    const village = await client.village("25", "2", "272500020303060000");
    expect(village?.utmZone).toBe(43);
    expect(await client.plotAt(village!, [73.723, 19.1169])).toBe("105");
    expect(await client.plotAt(village!, [73.73, 19.12])).toBeNull();
  });
});
