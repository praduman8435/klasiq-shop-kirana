import { db } from "@/lib/db";

const SUPPLIER_REFUND_HISTORY_PAGE_SIZE = 20;

export type SupplierRefundHistoryRow = {
  id: string;
  refundNumber: string;
  refundDate: Date;
  amountInPaise: number;
  refundMethod: string;
  receivedByName: string;
  reference: string | null;
};

export type SupplierRefundHistoryResult = {
  refunds: SupplierRefundHistoryRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  /** Sum of EVERY refund for this supplier (not just the current page) —
   *  the "Refunds Received" figure on Supplier Detail's summary. */
  totalAmountInPaise: number;
};

export async function getSupplierRefundHistory(params: {
  supplierId: string;
  page?: number;
}): Promise<SupplierRefundHistoryResult> {
  const pageSize = SUPPLIER_REFUND_HISTORY_PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);

  const [totalCount, totalAggregate, refunds] = await Promise.all([
    db.supplierRefund.count({ where: { supplierId: params.supplierId } }),
    db.supplierRefund.aggregate({ where: { supplierId: params.supplierId }, _sum: { amountInPaise: true } }),
    db.supplierRefund.findMany({
      where: { supplierId: params.supplierId },
      orderBy: { refundDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        refundNumber: true,
        refundDate: true,
        amountInPaise: true,
        refundMethod: true,
        receivedByName: true,
        reference: true,
      },
    }),
  ]);

  return {
    refunds,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    totalAmountInPaise: totalAggregate._sum.amountInPaise ?? 0,
  };
}

/**
 * Scoped to `supplierId` too (not just `id`), same "the route param and
 * the record must agree" rule every other detail query in this phase
 * establishes.
 */
export async function getSupplierRefundDetail(supplierId: string, refundId: string) {
  return db.supplierRefund.findFirst({
    where: { id: refundId, supplierId },
    include: {
      supplier: { select: { id: true, name: true } },
      sourceCredit: { select: { id: true, creditNumber: true } },
      sourceReturn: { select: { id: true, returnNumber: true } },
      createdByAdminUser: { select: { name: true } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
}
