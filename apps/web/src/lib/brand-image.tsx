import { markSvg } from "./brand";

/** The mark for `ImageResponse`, which renders an `<img>` of SVG reliably. Server only. */
export function MarkImage({ size, radius = 8, inset = 0 }: { size: number; radius?: number; inset?: number }) {
  const src = `data:image/svg+xml;base64,${Buffer.from(markSvg({ size, radius, inset })).toString("base64")}`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="" />;
}
