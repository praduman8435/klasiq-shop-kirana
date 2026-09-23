"use client";

import { createContext, useContext } from "react";

const BasketQuantitiesContext = createContext<Record<string, number>>({});

/**
 * Makes the bag's per-variant quantities available to every product card
 * without threading props through each listing page. The `(site)` layout
 * computes the map server-side from the same `getBasket()` it already
 * calls; every basket Server Action revalidates the layout, so the map is
 * always the server's truth after each change.
 */
export function BasketQuantitiesProvider({
  quantities,
  children,
}: {
  quantities: Record<string, number>;
  children: React.ReactNode;
}) {
  return <BasketQuantitiesContext.Provider value={quantities}>{children}</BasketQuantitiesContext.Provider>;
}

export function useBasketQuantity(productVariantId: string | undefined): number {
  const quantities = useContext(BasketQuantitiesContext);
  return productVariantId ? (quantities[productVariantId] ?? 0) : 0;
}
