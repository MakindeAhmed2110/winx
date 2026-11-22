import { createContext, useContext } from "react";

export type PrivyStatus = "unconfigured" | "loading" | "ready";

export const PrivyStatusContext = createContext<PrivyStatus>("unconfigured");

export function usePrivyStatus() {
  return useContext(PrivyStatusContext);
}
