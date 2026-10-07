/** ABA routing checksum used by US banks for ACH direct deposit. */
export function validAbaRouting(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits) || digits === "000000000") return false;
  const n = digits.split("").map(Number);
  const sum = 3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8]);
  return sum % 10 === 0;
}

export function validDepositAccount(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 && digits.length <= 17;
}

export function accountLast4(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.slice(-4);
}
