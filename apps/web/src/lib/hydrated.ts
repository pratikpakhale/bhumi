import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** False until hydration is over, so nothing read from the device is shown as missing. */
export const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);
