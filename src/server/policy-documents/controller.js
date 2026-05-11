import { createRequire } from 'module'
import { config } from '../../config/config.js'
import { buildBackendHeaders } from '../common/helpers/backend-headers.js'
import { fetchWithLog } from '../common/helpers/fetch-with-log.js'

const require = createRequire(import.meta.url)
const fallbackPolicyDocuments = require('./policy-documents.json')

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

function toDisplayDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function sanitizeSourceUrl(value) {
  if (!value || typeof value !== 'string') return ''

  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString()
    }
  } catch (_err) {
    return ''
  }

  return ''
}

function normalizeDocuments(body) {
  const rawDocuments =
    body?.documents ?? body?.policyDocuments ?? body?.items ?? body?.data ?? []

  if (!Array.isArray(rawDocuments)) {
    return { documents: [], total: 0 }
  }

  const documents = rawDocuments.map((doc, index) => ({
    documentId: doc.documentId ?? doc.id ?? `policy-doc-${index + 1}`,
    title: doc.title ?? doc.filename ?? doc.name ?? 'Untitled policy document',
    category: doc.category ?? 'N/A',
    type: doc.type ?? 'N/A',
    sourceUrl: sanitizeSourceUrl(doc.sourceUrl ?? doc.url ?? ''),
    isActive: Boolean(doc.isActive ?? doc.active ?? true),
    updatedAt: toDisplayDate(
      doc.updatedAt ?? doc.lastUpdatedAt ?? doc.createdAt
    ),
    editHref: `/policy-documents/edit?documentId=${encodeURIComponent(
      doc.documentId ?? doc.id ?? `policy-doc-${index + 1}`
    )}`
  }))

  return {
    documents,
    total: Number.isInteger(body?.total) ? body.total : documents.length
  }
}

function buildPageData(requestedPage, documents, itemsPerPage) {
  const totalItems = documents.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const currentPage = Math.min(
    Math.max(parseInt(requestedPage, 10) || 1, 1),
    totalPages
  )

  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const pageDocuments = documents.slice(startIndex, endIndex)

  return {
    pageDocuments,
    pagination: {
      summary: {
        startItem: totalItems > 0 ? startIndex + 1 : 0,
        endItem: endIndex,
        totalItems
      },
      items: buildPaginationItems(currentPage, totalPages),
      previous:
        currentPage > 1
          ? {
              href: `?page=${currentPage - 1}`,
              text: 'Previous'
            }
          : null,
      next:
        currentPage < totalPages
          ? {
              href: `?page=${currentPage + 1}`,
              text: 'Next'
            }
          : null
    }
  }
}

export const policyDocumentsController = {
  async handler(request, h) {
    const requestedPage = parseInt(request.query.page, 10) || 1
    const itemsPerPage = config.get('pagination.itemsPerPage')
    const endpointPath = '/policy-documents'

    let documents = []
    let totalItems = 0
    let useFallback = false

    try {
      const res = await fetchWithLog(
        `${config.get('backendApiUrl')}${endpointPath}?page=${requestedPage}&limit=${itemsPerPage}`,
        { headers: buildBackendHeaders(request) },
        request.logger
      )

      if (res.ok) {
        const body = await res.json()
        const normalized = normalizeDocuments(body)
        documents = normalized.documents
        totalItems = normalized.total
      } else {
        request.logger.error(
          { status: res.status },
          'Policy documents API returned non-OK response'
        )
        useFallback = true
      }
    } catch (err) {
      request.logger.error({ err }, 'Failed to fetch policy documents')
      useFallback = true
    }

    let pageDocuments
    let pagination

    if (useFallback) {
      const fallbackDocuments = normalizeDocuments({
        documents: fallbackPolicyDocuments
      }).documents

      ;({ pageDocuments, pagination } = buildPageData(
        requestedPage,
        fallbackDocuments,
        itemsPerPage
      ))
    } else {
      const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
      const currentPage = Math.min(Math.max(requestedPage, 1), totalPages)
      const startIndex = (currentPage - 1) * itemsPerPage
      const endIndex = Math.min(startIndex + documents.length, totalItems)

      pageDocuments = documents
      pagination = {
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
    }

    return h.view('policy-documents/index', {
      pageTitle: 'PolicyDocuments',
      heading: 'PolicyDocuments',
      policyDocuments: pageDocuments,
      pagination,
      paginationAlignment: config.get('pagination.alignment')
    })
  }
}

async function fetchPolicyDocumentById(request, documentId) {
  const endpointPath = '/policy-documents'

  // Try a dedicated by-id endpoint first.
  try {
    const byIdResponse = await fetchWithLog(
      `${config.get('backendApiUrl')}${endpointPath}/${encodeURIComponent(documentId)}`,
      { headers: buildBackendHeaders(request) },
      request.logger
    )

    if (byIdResponse.ok) {
      const body = await byIdResponse.json()
      const normalized = normalizeDocuments({
        documents: [body?.document ?? body]
      })
      if (normalized.documents[0]) {
        return normalized.documents[0]
      }
    }
  } catch (_err) {
    // Ignore and continue to fallback lookups.
  }

  // If by-id endpoint is not available, attempt list endpoint lookup.
  try {
    const listResponse = await fetchWithLog(
      `${config.get('backendApiUrl')}${endpointPath}?page=1&limit=200`,
      { headers: buildBackendHeaders(request) },
      request.logger
    )

    if (listResponse.ok) {
      const body = await listResponse.json()
      const normalized = normalizeDocuments(body)
      const match = normalized.documents.find(
        (doc) => doc.documentId === documentId
      )
      if (match) {
        return match
      }
    }
  } catch (_err) {
    // Ignore and continue to mock fallback.
  }

  const fallbackMatch = fallbackPolicyDocuments.find(
    (doc) => doc.documentId === documentId
  )
  if (!fallbackMatch) {
    return null
  }

  return {
    documentId: fallbackMatch.documentId,
    title: fallbackMatch.title,
    category: fallbackMatch.category,
    type: fallbackMatch.type,
    sourceUrl: sanitizeSourceUrl(fallbackMatch.sourceUrl),
    isActive: Boolean(fallbackMatch.isActive),
    updatedAt: toDisplayDate(fallbackMatch.updatedAt),
    editHref: `/policy-documents/edit?documentId=${encodeURIComponent(
      fallbackMatch.documentId
    )}`
  }
}

export const policyDocumentEditController = {
  async handler(request, h) {
    const documentId = String(request.query.documentId ?? '').trim()

    if (!documentId) {
      return h.view('policy-documents/edit', {
        pageTitle: 'Edit Policy Document',
        heading: 'Edit Policy Document',
        document: null,
        notFound: true,
        saveMessage: null,
        categoryOptions: config.get('policyDocuments.categoryOptions'),
        typeOptions: config.get('policyDocuments.typeOptions')
      })
    }

    const document = await fetchPolicyDocumentById(request, documentId)

    return h.view('policy-documents/edit', {
      pageTitle: 'Edit Policy Document',
      heading: 'Edit Policy Document',
      document,
      notFound: !document,
      saveMessage: null,
      categoryOptions: config.get('policyDocuments.categoryOptions'),
      typeOptions: config.get('policyDocuments.typeOptions')
    })
  }
}

export const policyDocumentEditSubmitController = {
  async handler(request, h) {
    const documentId = String(request.payload?.documentId ?? '').trim()
    const title = String(request.payload?.title ?? '').trim()
    const sourceUrl = sanitizeSourceUrl(
      String(request.payload?.sourceUrl ?? '').trim()
    )
    const category = String(request.payload?.category ?? '').trim()
    const type = String(request.payload?.type ?? '').trim()
    const isActive =
      String(request.payload?.isActive ?? '').toLowerCase() === 'true' ||
      request.payload?.isActive === true

    return h.view('policy-documents/edit', {
      pageTitle: 'Edit Policy Document',
      heading: 'Edit Policy Document',
      notFound: !documentId,
      saveMessage:
        'Review mode only: changes are displayed here and are not persisted yet.',
      categoryOptions: config.get('policyDocuments.categoryOptions'),
      typeOptions: config.get('policyDocuments.typeOptions'),
      document: documentId
        ? {
            documentId,
            title,
            sourceUrl,
            category,
            type,
            isActive,
            updatedAt: null,
            editHref: `/policy-documents/edit?documentId=${encodeURIComponent(
              documentId
            )}`
          }
        : null
    })
  }
}

export const policyDocumentsRedirectController = {
  handler(_request, h) {
    return h.redirect('/policy-documents')
  }
}
