/** Signed to derive the AES key. This signature never leaves the browser. */
export const BACKUP_KEY_MESSAGE = "Winx testnet backup v1";

/** Signed over each upload. A different message, so it cannot decrypt the blob. */
export function backupAuthMessage(address: string, version: number, ciphertextSha256: string) {
  return `Winx testnet backup auth\n${address.toLowerCase()}\n${version}\n${ciphertextSha256}`;
}
