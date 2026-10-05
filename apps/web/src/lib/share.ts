"use client";

/** Put text on the clipboard, falling back to the old selection trick where the API is missing. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/**
 * Share a link the way the device prefers — the system sheet on a phone, where
 * WhatsApp is one tap away — and copy it everywhere else.
 */
export async function shareLink(title: string, url: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (e) {
      // Dismissing the sheet is not a failure, and not a reason to copy instead.
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}
