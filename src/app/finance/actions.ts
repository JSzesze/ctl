"use server";

import { updateProposedCategoryOnDisk } from "@/lib/finance/categorization-plan-write";

export async function updateTransactionProposedCategory(
  transactionId: string,
  proposedCategory: string | null,
) {
  return updateProposedCategoryOnDisk(transactionId, proposedCategory);
}
