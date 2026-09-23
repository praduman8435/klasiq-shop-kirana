import { z } from "zod";
import { LEDGER_DATE_PRESET_VALUES } from "@/lib/supplier-ledger-date-range";
import { LEDGER_EVENT_TYPE_VALUES } from "@/server/queries/admin/supplier-ledger";

export const adminSupplierLedgerFiltersSchema = z.object({
  datePreset: z.enum(LEDGER_DATE_PRESET_VALUES).catch("ALL"),
  from: z.string().trim().max(10).optional(),
  to: z.string().trim().max(10).optional(),
  types: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.split(",").filter((v): v is (typeof LEDGER_EVENT_TYPE_VALUES)[number] => (LEDGER_EVENT_TYPE_VALUES as readonly string[]).includes(v)) : [])),
  q: z.string().trim().max(100).optional(),
  ledgerPage: z.coerce.number().int().min(1).catch(1),
});
