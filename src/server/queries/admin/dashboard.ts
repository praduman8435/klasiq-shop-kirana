import { db } from "@/lib/db";

export async function getDashboardStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    pendingCount,
    confirmedCount,
    readyForPickupCount,
    outForDeliveryCount,
    lowStockCount,
    outOfStockCount,
    todayOrders,
  ] = await Promise.all([
    db.order.count({ where: { status: "PENDING" } }),
    db.order.count({ where: { status: "CONFIRMED" } }),
    db.order.count({ where: { status: "READY_FOR_PICKUP" } }),
    db.order.count({ where: { status: "OUT_FOR_DELIVERY" } }),
    db.productVariant.count({ where: { isActive: true, stockStatus: "LOW_STOCK" } }),
    db.productVariant.count({ where: { isActive: true, stockStatus: "OUT_OF_STOCK" } }),
    db.order.findMany({
      where: { createdAt: { gte: startOfToday } },
      select: { totalInPaise: true },
    }),
  ]);

  return {
    pendingCount,
    confirmedCount,
    readyForPickupCount,
    outForDeliveryCount,
    lowStockCount,
    outOfStockCount,
    ordersToday: todayOrders.length,
    todaysOrderValueInPaise: todayOrders.reduce((sum, o) => sum + o.totalInPaise, 0),
  };
}
