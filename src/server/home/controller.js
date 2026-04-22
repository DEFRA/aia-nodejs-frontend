/**
 * A GDS styled example home page controller.
 * Provided as an example, remove or modify as required.
 */
import { createRequire } from 'module'
import { config } from '../../config/config.js'
import { buildBackendHeaders } from '../common/helpers/backend-headers.js'

const require = createRequire(import.meta.url)
const fallbackUploads = require('./uploads.json')

/**
 * Build GOV.UK pagination items with ellipsis for large page counts.
 * Always shows: first, last, current, and up to 1 neighbour on each side.
 */
function buildPaginationItems(currentPage, totalPages) {
  if (totalPages <= 1) return []

  const page = (n) => ({
    number: n,
    href: `?page=${n}`,
    current: n === currentPage
  })
  const ellipsis = () => ({ ellipsis: true })

  // Collect the page numbers that should always be shown
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

function buildPageData(requestedPage, uploadsData) {
  const itemsPerPage = config.get('pagination.itemsPerPage')
  const totalItems = uploadsData.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  // Clamp page number to valid range
  const currentPage = Math.min(
    Math.max(parseInt(requestedPage, 10) || 1, 1),
    totalPages
  )

  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const pageUploads = uploadsData.slice(startIndex, endIndex)

  const pagination = {
    summary: {
      startItem: startIndex + 1,
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

  return { pageUploads, pagination }
}

export const homeController = {
  async handler(request, h) {
    let uploadsData = []
    try {
      const res = await fetch(
        `${config.get('backendApiUrl')}/fetchUploadHistory`,
        { headers: buildBackendHeaders(request) }
      )
      if (res.ok) {
        uploadsData = await res.json()
      } else {
        uploadsData = fallbackUploads
      }
    } catch (err) {
      request.logger.error({ err }, 'Failed to fetch upload history')
      uploadsData = fallbackUploads
    }

    // Read and clear any upload error stored by the POST handler
    const uploadError = request.yar.flash('uploadError')[0] ?? null

    const { pageUploads, pagination } = buildPageData(
      request.query.page,
      uploadsData
    )
    return h.view('home/index', {
      pageTitle: uploadError ? 'Error: Upload Document' : 'Upload Document',
      heading: 'Home',
      uploads: pageUploads,
      allUploadFilenames: uploadsData.map((u) => u.filename),
      pagination,
      paginationAlignment: config.get('pagination.alignment'),
      maxUploadFileSizeBytes: config.get('upload.maxFileSizeMb') * 1024 * 1024,
      uploadError
    })
  }
}

export const uploadController = {
  options: {
    payload: {
      multipart: true,
      output: 'stream',
      parse: true,
      maxBytes: config.get('upload.maxFileSizeMb') * 1024 * 1024
    }
  },
  async handler(request, h) {
    const file = request.payload?.file
    const templateType = request.payload?.templateType
    const fileName = file?.hapi?.filename ?? file?.filename ?? 'upload'

    request.logger.info({ fileName, templateType }, 'Upload request received')

    if (!file) {
      request.logger.error('No file in payload')
      request.yar.flash('uploadError', 'Please select a file')
      return h.redirect('/')
    }

    const backendUrl = `${config.get('backendApiUrl')}/upload`
    request.logger.info({ backendUrl }, 'Calling backend upload')

    const formData = new FormData()
    formData.append(
      'file',
      new Blob([await streamToBuffer(file)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }),
      fileName
    )
    formData.append('templateType', templateType ?? '')
    formData.append('fileName', fileName)

    try {
      const res = await fetch(backendUrl, {
        method: 'POST',
        headers: buildBackendHeaders(request),
        body: formData
      })
      request.logger.info({ status: res.status }, 'Backend upload response')

      const responseBody = await res.json().catch(() => null)

      if (
        !res.ok ||
        (responseBody?.statusCode && responseBody.statusCode >= 400)
      ) {
        const errorMessage =
          responseBody?.errorMessage ??
          responseBody?.detail?.[0]?.msg ??
          'The document could not be uploaded. Please try again.'
        request.logger.error(
          { status: res.status, responseBody },
          'Upload failed'
        )
        request.yar.flash('uploadError', errorMessage)
      }
    } catch (err) {
      request.logger.error({ err }, 'Upload request error')
      request.yar.flash(
        'uploadError',
        'The document could not be uploaded due to a network error. Please try again.'
      )
    }

    return h.redirect('/')
  }
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
