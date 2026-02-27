import type { EstimateItem } from '@/lib/types/estimate'

export type TaxMode = 'exclusive' | 'inclusive'

function roundCurrency(value: number): number {
  return Math.round(value)
}

type CalcLineInput = {
  item_name: string
  unit: string | null
  unit_price: number
  quantity: number
  tax_rate: number
}

type CalcLineResult = Omit<EstimateItem, 'id' | 'estimate_id' | 'display_order' | 'created_at' | 'updated_at'>

export function calcLine(input: CalcLineInput, taxMode: TaxMode): CalcLineResult {
  const quantity = Number.isFinite(input.quantity) ? input.quantity : 0
  const unitPrice = Number.isFinite(input.unit_price) ? input.unit_price : 0
  const taxRate = Number.isFinite(input.tax_rate) ? input.tax_rate : 0.1

  const rawAmount = quantity * unitPrice
  const amountExclTax =
    taxMode === 'exclusive' ? roundCurrency(rawAmount) : roundCurrency(rawAmount / (1 + taxRate))
  const amountInclTax =
    taxMode === 'inclusive' ? roundCurrency(rawAmount) : roundCurrency(amountExclTax * (1 + taxRate))
  const taxAmount = amountInclTax - amountExclTax

  return {
    item_name: input.item_name,
    unit: input.unit,
    unit_price: unitPrice,
    quantity,
    subtotal: amountExclTax,
    tax_rate: taxRate,
    amount_excl_tax: amountExclTax,
    tax_amount: taxAmount,
    amount_incl_tax: amountInclTax,
  }
}

export function calcTotals(items: Pick<EstimateItem, 'amount_excl_tax' | 'tax_amount' | 'amount_incl_tax'>[]) {
  return items.reduce(
    (acc, item) => {
      acc.subtotalExclTax += item.amount_excl_tax || 0
      acc.totalTax += item.tax_amount || 0
      acc.totalInclTax += item.amount_incl_tax || 0
      return acc
    },
    { subtotalExclTax: 0, totalTax: 0, totalInclTax: 0 }
  )
}
