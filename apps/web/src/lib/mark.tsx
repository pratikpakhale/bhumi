import { SITE } from "./site";

/** The app mark — a "B" on the accent — drawn for `ImageResponse`. */
export function Mark({ size, radius }: { size: number; radius: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: SITE.accent,
        color: SITE.paper,
        borderRadius: radius,
        fontSize: size * 0.62,
        fontWeight: 700,
        letterSpacing: "-0.04em",
      }}
    >
      B
    </div>
  );
}
