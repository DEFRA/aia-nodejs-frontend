import { createRequire } from 'module'
import { config } from '../../config/config.js'
import { buildBackendHeaders } from '../common/helpers/backend-headers.js'
import { fetchWithLog } from '../common/helpers/fetch-with-log.js'

const require = createRequire(import.meta.url)
const fallbackData = require('./cost-usage.json')

function buildPaginationItems(currentPage, totalPages) {
  if (totalPages <= 1) return []

  const page = (n) => ({
    number: n,
    href: `?page=${n}`,
    current: n === currentPage
  })
  const ellipsis = () => ({ ellipsis: true })

  const visible = new Set([
    1,
    totalPages,
    currentPage,
    currentPage - 1,
    currentPage + 1
  ])

  const pages = Array.from(visible)
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b)

  const items = []
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) {
      items.push(ellipsis())
    }
    items.push(page(pages[i]))
  }
  return items
}

function enrichCostData(costUsage) {
  return (costUsage ?? []).map((doc) => {
    const agents = (doc.agents ?? []).map((agent) => ({
      ...agent,
      totalTokens: (agent.inputTokens ?? 0) + (agent.outputTokens ?? 0)
    }))
    return {
      ...doc,
      agents,
      totalInputTokens: agents.reduce(
        (sum, a) => sum + (a.inputTokens ?? 0),
        0
      ),
      totalOutputTokens: agents.reduce(
        (sum, a) => sum + (a.outputTokens ?? 0),
        0
      ),
      totalDocTokens: agents.reduce((sum, a) => sum + a.totalTokens, 0)
    }
  })
}

export const costController = {
  async handler(request, h) {
    const requestedPage = parseInt(request.query.page, 10) || 1
    const itemsPerPage = config.get('pagination.itemsPerPage')
    let costUsageData = []
    let summaryData = null
    let totalItems = 0

    let usedFallback = false

    try {
      const res = await fetchWithLog(
        `${config.get('backendApiUrl')}/cost-usage?page=${requestedPage}&limit=${itemsPerPage}`,
        { headers: buildBackendHeaders(request) },
        request.logger
      )
      if (res.ok) {
        const body = await res.json()
        costUsageData = body.costUsage ?? []
        totalItems = body.pagination?.total ?? costUsageData.length
        summaryData = body.summary ?? null
      } else {
        request.logger.error(
          { status: res.status },
          'Cost usage API returned non-OK response, using fallback'
        )
        usedFallback = true
        costUsageData = fallbackData.costUsage ?? []
        totalItems = fallbackData.pagination?.total ?? costUsageData.length
        summaryData = fallbackData.summary ?? null
      }
    } catch (err) {
      request.logger.error(
        { err },
        'Failed to fetch cost usage, using fallback'
      )
      usedFallback = true
      costUsageData = fallbackData.costUsage ?? []
      totalItems = fallbackData.pagination?.total ?? costUsageData.length
      summaryData = fallbackData.summary ?? null
    }

    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1
    const currentPage = Math.min(Math.max(requestedPage, 1), totalPages)
    const startIndex = (currentPage - 1) * itemsPerPage

    if (usedFallback) {
      costUsageData = costUsageData.slice(startIndex, startIndex + itemsPerPage)
    }

    const endIndex = Math.min(startIndex + costUsageData.length, totalItems)

    const pagination = {
      summary: {
        startItem: totalItems > 0 ? startIndex + 1 : 0,
        endItem: endIndex,
        totalItems
      },
      items: buildPaginationItems(currentPage, totalPages),
      previous:
        currentPage > 1
          ? { href: `?page=${currentPage - 1}`, text: 'Previous' }
          : null,
      next:
        currentPage < totalPages
          ? { href: `?page=${currentPage + 1}`, text: 'Next' }
          : null
    }

    return h.view('cost/index', {
      pageTitle: 'Cost Usage',
      costUsage: enrichCostData(costUsageData),
      summary: summaryData,
      pagination,
      paginationAlignment: config.get('pagination.alignment')
    })
  }
}
