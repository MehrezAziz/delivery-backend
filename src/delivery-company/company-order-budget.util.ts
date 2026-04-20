import { DeliveryCompanyTransactionType, OrderSourceType } from '@prisma/client';

/**
 * Restores funds locked for a delivery-company order (cancel / terminal failure).
 * Department-scoped orders: placement debited `price + returnReserve` from `availableCoins` only.
 * Main-company orders use `DeliveryCompany` coin balance + lockedCoins.
 */
export async function rollbackDeliveryCompanyOrderFundsInTx(
  tx: any,
  order: {
    id: string;
    price: unknown;
    deliveryCompanyId: string | null;
    deliveryCompanyDepartmentId: string | null;
    sourceType: OrderSourceType | string;
  },
  statusLabel: string,
): Promise<void> {
  if (!order.deliveryCompanyId || order.sourceType !== OrderSourceType.DELIVERY_COMPANY) return;

  const price = Math.round(Number(order.price || 0) * 100) / 100;
  const reserve = Math.round(price * 0.5 * 100) / 100;
  const encumber = Math.round((price + reserve) * 100) / 100;
  const deptId = order.deliveryCompanyDepartmentId;

  if (deptId) {
    const wallet = await tx.deliveryCompanyDepartmentBudgetWallet.findUnique({
      where: { departmentId: deptId },
    });
    if (wallet) {
      await tx.deliveryCompanyDepartmentBudgetWallet.update({
        where: { departmentId: deptId },
        data: {
          availableCoins: Math.round((Number(wallet.availableCoins) + encumber) * 100) / 100,
        },
      });
    }
    return;
  }

  const company = await tx.deliveryCompany.findUnique({ where: { id: order.deliveryCompanyId } });
  if (!company) return;
  const unlock = Math.min(Number(company.lockedCoins), reserve);
  const nextBalance = Math.round((Number(company.coinBalance) + price) * 100) / 100;
  const nextLocked = Math.max(0, Number(company.lockedCoins) - unlock);
  await tx.deliveryCompany.update({
    where: { id: company.id },
    data: { coinBalance: nextBalance, lockedCoins: nextLocked },
  });
  await tx.deliveryCompanyTransaction.create({
    data: {
      deliveryCompanyId: company.id,
      orderId: order.id,
      type: DeliveryCompanyTransactionType.ADMIN_ADJUSTMENT,
      amount: price,
      balanceAfter: nextBalance,
      description: `Budget rollback for ${statusLabel} order ${order.id}`,
    },
  });
}
