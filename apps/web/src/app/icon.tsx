import { ImageResponse } from "next/og";
import { Mark } from "@/lib/mark";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<Mark size={64} radius={14} />, size);
}
