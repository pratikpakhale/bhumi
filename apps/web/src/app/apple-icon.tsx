import { ImageResponse } from "next/og";
import { MarkImage } from "@/lib/brand-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS rounds the corners itself, and draws nothing under a transparent edge.
  return new ImageResponse(<MarkImage size={180} radius={0} inset={0.06} />, size);
}
