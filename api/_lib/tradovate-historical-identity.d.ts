export type HistoricalIdentity = {
  contractId: string; contractSymbol: string; entryOrderId: string; exitOrderId: string;
  buyFillId: string; sellFillId: string; openedAt: string; closedAt: string;
  candidateOrderIds: string[]; orderCount: number; fillCount: number;
};
export function matchHistoricalIdentity(ordersText: string, fillsText: string,
  selection: { accountId: string; tradeId: string; contractSymbol?: string; side: string; quantity: string | number; entry: string | number; exit: string | number; openedAt: string; closedAt: string },
  accountName: string, window: {startDate: string; endDate: string}): HistoricalIdentity;
export function validateDetailContracts(reports: { name: string; params: { name: string; paramType: string; optional: boolean }[] }[]): void;
