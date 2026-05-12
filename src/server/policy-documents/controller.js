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

  const documents = rawDocuments.map((doc, index) => {
    const id = doc.url_id ?? doc.urlId ?? `policy-doc-${index + 1}`
    return {
      documentId: id,
      title: doc.filename ?? 'Untitled policy document',
      category: doc.category ?? 'N/A',
      type: doc.source ?? 'N/A',
      sourceUrl: sanitizeSourceUrl(doc.url ?? ''),
      isActive: Boolean(doc.isactive ?? doc.isActive ?? true),
      updatedAt: toDisplayDate(doc.updatedAt),
      editHref: `/policy-documents/edit?documentId=${encodeURIComponent(id)}`
    }
  })

  return {
    documents,
    total: Number.isInteger(body?.total) ? body.total : documents.length
  }
}

async function fetchPolicyDocumentOptions(request) {
  try {
    const res = await fetchWithLog(
      `${config.get('backendApiUrl')}/policy-documents/options`,
      { headers: buildBackendHeaders(request) },
      request.logger
    )
    if (res.ok) {
      const body = await res.json()
      return {
        categoryOptions: Array.isArray(body?.categories)
          ? body.categories
          : null,
        typeOptions: Array.isArray(body?.sources) ? body.sources : null
      }
    }
  } catch (_err) {
    // Fall back to config defaults.
  }
  return { categoryOptions: null, typeOptions: null }
}

const TITLE_MAX = 500
const URL_MAX = 4000
const CATEGORY_MAX = 100

function isPositiveIntegerString(value) {
  return /^\d+$/.test(value) && Number(value) > 0
}

function includesIgnoreCase(options, value) {
  if (!Array.isArray(options) || options.length === 0) return false
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  return options.some(
    (option) => String(option).trim().toLowerCase() === normalized
  )
}

function validatePolicyDocumentFields({
  title,
  rawSourceUrl,
  sanitizedSourceUrl,
  category,
  type,
  categoryOptions,
  typeOptions
}) {
  const errors = {}

  if (!title) {
    errors.title = 'Enter a title or filename'
  } else if (title.length > TITLE_MAX) {
    errors.title = `Title or filename must be ${TITLE_MAX} characters or fewer`
  }

  if (!rawSourceUrl) {
    errors.sourceUrl = 'Enter a URL'
  } else if (!sanitizedSourceUrl) {
    errors.sourceUrl = 'Enter a valid URL starting with http:// or https://'
  } else if (rawSourceUrl.length > URL_MAX) {
    errors.sourceUrl = `URL must be ${URL_MAX} characters or fewer`
  }

  if (!category) {
    errors.category = 'Select a category'
  } else if (category.length > CATEGORY_MAX) {
    errors.category = `Category must be ${CATEGORY_MAX} characters or fewer`
  } else if (!includesIgnoreCase(categoryOptions, category)) {
    errors.category = 'Select a valid category'
  }

  if (!type) {
    errors.type = 'Select a source'
  } else if (!includesIgnoreCase(typeOptions, type)) {
    errors.type = 'Select a valid source'
  }

  return errors
}

function buildErrorList(errors) {
  const fieldHrefs = {
    title: '#title',
    sourceUrl: '#sourceUrl',
    category: '#category',
    type: '#type'
  }
  return ['title', 'sourceUrl', 'category', 'type']
    .filter((f) => errors[f])
    .map((f) => ({ text: errors[f], href: fieldHrefs[f] }))
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
  try {
    const res = await fetchWithLog(
      `${config.get('backendApiUrl')}/policy-documents/${encodeURIComponent(documentId)}`,
      { headers: buildBackendHeaders(request) },
      request.logger
    )

    if (res.ok) {
      const body = await res.json()
      const normalized = normalizeDocuments({ documents: [body] })
      if (normalized.documents[0]) {
        return normalized.documents[0]
      }
    }
  } catch (_err) {
    // Fall through to mock fallback.
  }

  const fallbackMatch = fallbackPolicyDocuments.find(
    (doc) => String(doc.url_id ?? doc.urlId) === String(documentId)
  )
  if (!fallbackMatch) return null

  return normalizeDocuments({ documents: [fallbackMatch] }).documents[0] ?? null
}

export const policyDocumentEditController = {
  async handler(request, h) {
    const documentId = String(request.query.documentId ?? '').trim()

    const { categoryOptions: apiCategories, typeOptions: apiSources } =
      await fetchPolicyDocumentOptions(request)
    const categoryOptions =
      apiCategories ?? config.get('policyDocuments.categoryOptions')
    const typeOptions = apiSources ?? config.get('policyDocuments.typeOptions')

    if (!documentId || !isPositiveIntegerString(documentId)) {
      return h.view('policy-documents/edit', {
        pageTitle: 'Edit Policy Document',
        heading: 'Edit Policy Document',
        isNew: false,
        document: null,
        notFound: true,
        saveMessage: null,
        saveSuccess: false,
        errors: {},
        errorList: [],
        categoryOptions,
        typeOptions
      })
    }

    const document = await fetchPolicyDocumentById(request, documentId)

    return h.view('policy-documents/edit', {
      pageTitle: 'Edit Policy Document',
      heading: 'Edit Policy Document',
      isNew: false,
      document,
      notFound: !document,
      saveMessage: null,
      saveSuccess: false,
      errors: {},
      errorList: [],
      categoryOptions,
      typeOptions
    })
  }
}

export const policyDocumentEditSubmitController = {
  async handler(request, h) {
    const documentId = String(request.payload?.documentId ?? '').trim()
    const title = String(request.payload?.title ?? '').trim()
    const rawSourceUrl = String(request.payload?.sourceUrl ?? '').trim()
    const sanitizedSourceUrl = sanitizeSourceUrl(rawSourceUrl)
    const category = String(request.payload?.category ?? '').trim()
    const type = String(request.payload?.type ?? '').trim()
    const isActive =
      String(request.payload?.isActive ?? '').toLowerCase() === 'true' ||
      request.payload?.isActive === true

    const { categoryOptions: apiCategories, typeOptions: apiSources } =
      await fetchPolicyDocumentOptions(request)
    const categoryOptions =
      apiCategories ?? config.get('policyDocuments.categoryOptions')
    const typeOptions = apiSources ?? config.get('policyDocuments.typeOptions')

    if (!documentId || !isPositiveIntegerString(documentId)) {
      return h.view('policy-documents/edit', {
        pageTitle: 'Edit Policy Document',
        heading: 'Edit Policy Document',
        isNew: false,
        notFound: true,
        saveMessage: null,
        saveSuccess: false,
        errors: {},
        errorList: [],
        categoryOptions,
        typeOptions,
        document: null
      })
    }

    const errors = validatePolicyDocumentFields({
      title,
      rawSourceUrl,
      sanitizedSourceUrl,
      category,
      type,
      categoryOptions,
      typeOptions
    })

    if (Object.keys(errors).length > 0) {
      return h.view('policy-documents/edit', {
        pageTitle: 'Edit Policy Document',
        heading: 'Edit Policy Document',
        isNew: false,
        notFound: false,
        saveMessage: null,
        saveSuccess: false,
        errors,
        errorList: buildErrorList(errors),
        categoryOptions,
        typeOptions,
        document: {
          documentId,
          title,
          sourceUrl: rawSourceUrl,
          category,
          type,
          isActive,
          updatedAt: null,
          editHref: `/policy-documents/edit?documentId=${encodeURIComponent(documentId)}`
        }
      })
    }

    let saveMessage
    let saveSuccess = false
    let savedDocument

    try {
      const res = await fetchWithLog(
        `${config.get('backendApiUrl')}/policy-documents/${encodeURIComponent(documentId)}`,
        {
          method: 'PUT',
          headers: {
            ...buildBackendHeaders(request),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: title,
            category,
            source: type,
            url: sanitizedSourceUrl,
            isActive
          })
        },
        request.logger
      )

      if (res.ok) {
        const body = await res.json()
        savedDocument = normalizeDocuments({ documents: [body] }).documents[0]
        saveMessage = 'Policy document updated successfully.'
        saveSuccess = true
      } else {
        const errorBody = await res.json().catch(() => ({}))
        saveMessage = `Failed to save changes: ${
          errorBody?.detail ?? res.statusText ?? 'Unknown error'
        }`
        savedDocument = {
          documentId,
          title,
          sourceUrl: rawSourceUrl,
          category,
          type,
          isActive,
          updatedAt: null,
          editHref: `/policy-documents/edit?documentId=${encodeURIComponent(documentId)}`
        }
      }
    } catch (err) {
      request.logger.error({ err }, 'Failed to update policy document')
      saveMessage = 'An error occurred while saving changes. Please try again.'
      savedDocument = {
        documentId,
        title,
        sourceUrl: rawSourceUrl,
        category,
        type,
        isActive,
        updatedAt: null,
        editHref: `/policy-documents/edit?documentId=${encodeURIComponent(documentId)}`
      }
    }

    return h.view('policy-documents/edit', {
      pageTitle: 'Edit Policy Document',
      heading: 'Edit Policy Document',
      isNew: false,
      notFound: false,
      saveMessage,
      saveSuccess,
      errors: {},
      errorList: [],
      categoryOptions,
      typeOptions,
      document: savedDocument
    })
  }
}

export const policyDocumentsRedirectController = {
  handler(_request, h) {
    return h.redirect('/policy-documents')
  }
}
export const policyDocumentNewController = {
  async handler(request, h) {
    const { categoryOptions: apiCategories, typeOptions: apiSources } =
      await fetchPolicyDocumentOptions(request)
    const categoryOptions =
      apiCategories ?? config.get('policyDocuments.categoryOptions')
    const typeOptions = apiSources ?? config.get('policyDocuments.typeOptions')

    return h.view('policy-documents/edit', {
      pageTitle: 'Add Policy Document',
      heading: 'Add Policy Document',
      isNew: true,
      notFound: false,
      saveMessage: null,
      saveSuccess: false,
      errors: {},
      errorList: [],
      categoryOptions,
      typeOptions,
      document: {
        documentId: null,
        title: '',
        sourceUrl: '',
        category: '',
        type: '',
        isActive: true,
        updatedAt: null,
        editHref: null
      }
    })
  }
}

export const policyDocumentNewSubmitController = {
  async handler(request, h) {
    const title = String(request.payload?.title ?? '').trim()
    const rawSourceUrl = String(request.payload?.sourceUrl ?? '').trim()
    const sanitizedSourceUrl = sanitizeSourceUrl(rawSourceUrl)
    const category = String(request.payload?.category ?? '').trim()
    const type = String(request.payload?.type ?? '').trim()
    const isActive =
      String(request.payload?.isActive ?? '').toLowerCase() === 'true' ||
      request.payload?.isActive === true

    const { categoryOptions: apiCategories, typeOptions: apiSources } =
      await fetchPolicyDocumentOptions(request)
    const categoryOptions =
      apiCategories ?? config.get('policyDocuments.categoryOptions')
    const typeOptions = apiSources ?? config.get('policyDocuments.typeOptions')

    const errors = validatePolicyDocumentFields({
      title,
      rawSourceUrl,
      sanitizedSourceUrl,
      category,
      type,
      categoryOptions,
      typeOptions
    })

    if (Object.keys(errors).length > 0) {
      return h.view('policy-documents/edit', {
        pageTitle: 'Add Policy Document',
        heading: 'Add Policy Document',
        isNew: true,
        notFound: false,
        saveMessage: null,
        saveSuccess: false,
        errors,
        errorList: buildErrorList(errors),
        categoryOptions,
        typeOptions,
        document: {
          documentId: null,
          title,
          sourceUrl: rawSourceUrl,
          category,
          type,
          isActive,
          updatedAt: null,
          editHref: null
        }
      })
    }

    let saveMessage
    let saveSuccess = false
    let isNew = true
    let savedDocument = {
      documentId: null,
      title,
      sourceUrl: rawSourceUrl,
      category,
      type,
      isActive,
      updatedAt: null,
      editHref: null
    }

    try {
      const res = await fetchWithLog(
        `${config.get('backendApiUrl')}/policy-documents`,
        {
          method: 'POST',
          headers: {
            ...buildBackendHeaders(request),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: title,
            category,
            source: type,
            url: sanitizedSourceUrl,
            isActive
          })
        },
        request.logger
      )

      if (res.ok) {
        const body = await res.json()
        savedDocument = normalizeDocuments({ documents: [body] }).documents[0]
        saveMessage = 'Policy document created successfully.'
        saveSuccess = true
        isNew = false
      } else {
        const errorBody = await res.json().catch(() => ({}))
        saveMessage = `Failed to create document: ${
          errorBody?.detail ?? res.statusText ?? 'Unknown error'
        }`
      }
    } catch (err) {
      request.logger.error({ err }, 'Failed to create policy document')
      saveMessage =
        'An error occurred while creating the document. Please try again.'
    }

    return h.view('policy-documents/edit', {
      pageTitle: isNew ? 'Add Policy Document' : 'Edit Policy Document',
      heading: isNew ? 'Add Policy Document' : 'Edit Policy Document',
      isNew,
      notFound: false,
      saveMessage,
      saveSuccess,
      errors: {},
      errorList: [],
      categoryOptions,
      typeOptions,
      document: savedDocument
    })
  }
}

export const policyDocumentDeleteController = {
  async handler(request, h) {
    const documentId = String(request.payload?.documentId ?? '').trim()

    if (documentId && isPositiveIntegerString(documentId)) {
      try {
        await fetchWithLog(
          `${config.get('backendApiUrl')}/policy-documents/${encodeURIComponent(documentId)}`,
          {
            method: 'DELETE',
            headers: buildBackendHeaders(request)
          },
          request.logger
        )
      } catch (err) {
        request.logger.error({ err }, 'Failed to delete policy document')
      }
    }

    return h.redirect('/policy-documents')
  }
}
