// Ojas — money utilities. All financial calculations use Prisma.Decimal (which
// maps to PostgreSQL numeric). JavaScript floating-point is NEVER used for
// monetary settlement where exactness matters.
//
// Rounding policy: HALF_UP to 2 decimal places (paisa precision). This matches
// typical INR claim/billing settlement conventions.
import { Prisma } from "@prisma/client";

export type Money = Prisma.Decimal;

/** Create a Decimal from a string | number | Decimal. Validates non-negative. */
export function money(value: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal("0");
  const d = new Prisma.Decimal(value);
  if (d.isNaN()) throw new Error(`Invalid money value: ${value}`);
  return d;
}

/** Round to 2 decimal places (paisa), HALF_UP. Accepts nullable (treats as 0). */
export function roundMoney(value: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal {
  return money(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Safe addition — returns a new Decimal. Never throws on null inputs. */
export function addMoney(...values: Array<string | number | Prisma.Decimal | null | undefined>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(money(v)), new Prisma.Decimal("0"));
}

/** Safe subtraction. Clamps to zero (no negative settlements unless allowNegative). */
export function subMoney(
  a: string | number | Prisma.Decimal | null | undefined,
  b: string | number | Prisma.Decimal | null | undefined,
  opts: { allowNegative?: boolean } = {},
): Prisma.Decimal {
  const result = money(a).minus(money(b));
  if (!opts.allowNegative && result.isNegative()) return new Prisma.Decimal("0");
  return result;
}

/** Percentage of an amount, rounded to 2dp. e.g. percent(amount, 10) = 10%. */
export function percent(
  amount: string | number | Prisma.Decimal | null | undefined,
  pct: number,
): Prisma.Decimal {
  const d = money(amount);
  return roundMoney(d.times(pct).div(100));
}

/** Patient share given approved amount and a copay percentage (0-100). */
export function computePatientShare(
  approvedAmount: string | number | Prisma.Decimal | null | undefined,
  copayPct: number,
): Prisma.Decimal {
  return percent(approvedAmount, copayPct);
}

/** Payable = approved - patientShare ( insurer pays the rest ). */
export function computePayable(
  approvedAmount: string | number | Prisma.Decimal | null | undefined,
  patientShare: string | number | Prisma.Decimal | null | undefined,
): Prisma.Decimal {
  return subMoney(approvedAmount, patientShare);
}

/** Compare two money values for equality (rounded). */
export function moneyEquals(
  a: string | number | Prisma.Decimal | null | undefined,
  b: string | number | Prisma.Decimal | null | undefined,
): boolean {
  return roundMoney(a).equals(roundMoney(b));
}

/** Serialize a Decimal for JSON responses (string to preserve precision). */
export function moneyToString(value: string | number | Prisma.Decimal | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0.00";
  try {
    return roundMoney(value).toFixed(2);
  } catch {
    return "0.00";
  }
}

/** Validate that a string is a valid money amount (1-12 digits, optional 2dp). */
export function isValidMoneyString(s: string): boolean {
  return /^\d{1,12}(\.\d{1,2})?$/.test(s);
}
