import { calcLine, calcTotals, type TaxMode } from '@/lib/estimate/calc'
import type { Customer } from '@/lib/types/customer'
import type { Estimate, EstimateItem, EstimateJsonV1 } from '@/lib/types/estimate'
import type { Project } from '@/lib/types/project'

type IssuerInfo = {
  companyName: string
  address: string
}

const DEFAULT_ISSUER: IssuerInfo = {
  companyName: process.env.NEXT_PUBLIC_ESTIMATE_ISSUER_NAME ?? '株式会社イザゲ',
  address: process.env.NEXT_PUBLIC_ESTIMATE_ISSUER_ADDRESS ?? '',
}

export function toEstimateJson(
  estimate: Estimate,
  items: EstimateItem[],
  project: Project,
  customer: Customer | null
): EstimateJsonV1 {
  const taxMode: TaxMode = estimate.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive'
  const normalizedItems = items.map((item, idx) => {
    const computed = calcLine(
      {
        item_name: item.item_name,
        unit: item.unit ?? '式',
        unit_price: Number(item.unit_price) || 0,
        quantity: Number(item.quantity) || 0,
        tax_rate: Number(item.tax_rate) || 0.1,
      },
      taxMode
    )

    return {
      lineNo: idx + 1,
      description: computed.item_name,
      qty: computed.quantity,
      unit: computed.unit ?? '式',
      unitPrice: computed.unit_price,
      taxRate: computed.tax_rate,
      amountExclTax: computed.amount_excl_tax,
      taxAmount: computed.tax_amount,
      amountInclTax: computed.amount_incl_tax,
    }
  })

  const totals = calcTotals(
    normalizedItems.map((item) => ({
      amount_excl_tax: item.amountExclTax,
      tax_amount: item.taxAmount,
      amount_incl_tax: item.amountInclTax,
    }))
  )

  return {
    format: 'kannri-estimate',
    version: '1.0',
    estimateNo: project.project_number,
    projectId: project.id,
    subject: estimate.subject ?? '',
    issueDate: estimate.issue_date ?? estimate.created_at.slice(0, 10),
    validUntil: estimate.valid_until ?? estimate.created_at.slice(0, 10),
    taxMode,
    customer: {
      name: customer?.name ?? '',
      address: customer?.address ?? '',
    },
    issuer: DEFAULT_ISSUER,
    items: normalizedItems,
    totals,
    notes: estimate.notes ?? '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function parseEstimateJson(input: unknown): EstimateJsonV1 {
  if (!isRecord(input)) throw new Error('JSONの形式が不正です')
  if (input.format !== 'kannri-estimate' || input.version !== '1.0') {
    throw new Error('未対応の見積JSONフォーマットです')
  }
  if (input.taxMode !== 'exclusive' && input.taxMode !== 'inclusive') {
    throw new Error('taxMode は exclusive か inclusive を指定してください')
  }
  if (!Array.isArray(input.items)) {
    throw new Error('items は配列で指定してください')
  }
  const customer = isRecord(input.customer) ? input.customer : {}
  const issuer = isRecord(input.issuer) ? input.issuer : {}
  const totals = isRecord(input.totals) ? input.totals : {}

  const normalizedItems = input.items.map((item, idx) => {
    if (!isRecord(item)) {
      throw new Error(`items[${idx}] の形式が不正です`)
    }
    return {
      lineNo: toNumber(item.lineNo, idx + 1),
      description: String(item.description ?? ''),
      qty: toNumber(item.qty, 0),
      unit: String(item.unit ?? '式'),
      unitPrice: toNumber(item.unitPrice, 0),
      taxRate: toNumber(item.taxRate, 0.1),
      amountExclTax: toNumber(item.amountExclTax, 0),
      taxAmount: toNumber(item.taxAmount, 0),
      amountInclTax: toNumber(item.amountInclTax, 0),
    }
  })

  return {
    format: 'kannri-estimate',
    version: '1.0',
    estimateNo: String(input.estimateNo ?? ''),
    projectId: String(input.projectId ?? ''),
    subject: String(input.subject ?? ''),
    issueDate: String(input.issueDate ?? ''),
    validUntil: String(input.validUntil ?? ''),
    taxMode: input.taxMode,
    customer: {
      name: String(customer.name ?? ''),
      address: String(customer.address ?? ''),
    },
    issuer: {
      companyName: String(issuer.companyName ?? ''),
      address: String(issuer.address ?? ''),
    },
    items: normalizedItems,
    totals: {
      subtotalExclTax: toNumber(totals.subtotalExclTax, 0),
      totalTax: toNumber(totals.totalTax, 0),
      totalInclTax: toNumber(totals.totalInclTax, 0),
    },
    notes: String(input.notes ?? ''),
  }
}

