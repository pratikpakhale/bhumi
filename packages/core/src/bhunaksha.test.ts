import { describe, expect, it } from "vitest";
import { BhunakshaClient } from "./bhunaksha.js";
import { bhunakshaCode, matchPlot } from "./map.js";

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
        });
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
  });
});
