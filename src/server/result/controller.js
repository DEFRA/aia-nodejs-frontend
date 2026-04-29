/**
 * Result page controller.
 * Fetches a document result from the backend API GET /documents/{documentId}
 * and renders the resultMd markdown content.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { config } from '../../config/config.js'
import { buildBackendHeaders } from '../common/helpers/backend-headers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const RESULT2_DOC_ID = 'UUID-1234-5678-9012-abcdef123456'

function resolveMockFileName(documentId) {
  return documentId === RESULT2_DOC_ID ? 'result2.json' : 'result.json'
}

function parseJsonPayload(payload) {
  if (payload == null) return null
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      return payload
    }
  }
  return payload
}

function extractMarkdownContent(payload) {
  const parsedPayload = parseJsonPayload(payload)

  if (typeof parsedPayload === 'string') return parsedPayload
  if (!parsedPayload || typeof parsedPayload !== 'object') return ''

  // Backend API returns { resultMd: "..." }
  if (typeof parsedPayload.resultMd === 'string') return parsedPayload.resultMd

  const candidates = [parsedPayload, parsedPayload.result, parsedPayload.data]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    if (typeof candidate.markdownContent === 'string') {
      return candidate.markdownContent
    }
    if (typeof candidate.markdown === 'string') return candidate.markdown
    if (typeof candidate.resultMd === 'string') return candidate.resultMd
    if (
      Array.isArray(candidate.content) &&
      typeof candidate.content[0]?.text === 'string'
    ) {
      return candidate.content[0].text
    }
  }
  return ''
}

function getMockResultContent(documentId) {
  const mockFileName = resolveMockFileName(documentId)
  const resultsDataRaw = readFileSync(`${__dirname}/${mockFileName}`, 'utf8')
  const resultsData = JSON.parse(resultsDataRaw)
  return extractMarkdownContent(resultsData)
}

async function getApiResultContent(documentId, request) {
  const backendApiUrl = config.get('backendApiUrl')

  if (!backendApiUrl) {
    throw new Error('BACKEND_API_URL is not configured')
  }

  if (!documentId) {
    throw new Error('documentId is required')
  }

  const timeoutMs = config.get('result.apiTimeoutMs')
  const timeoutController = new AbortController()
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs)

  try {
    const response = await fetch(`${backendApiUrl}/documents/${documentId}`, {
      method: 'GET',
      signal: timeoutController.signal,
      headers: {
        ...buildBackendHeaders(request),
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(
        `Result API request failed with status ${response.status}`
      )
    }

    const body = await response.json()
    // Backend returns { documentId, status, resultMd, errorMessage, ... }
    if (body.status === 'ERROR') {
      return body.errorMessage ?? 'An error occurred during processing.'
    }
    return body.resultMd ?? ''
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export const resultController = {
  async handler(request, h) {
    const documentId = request.query.documentId
    let markdownContent = ''

    try {
      try {
        markdownContent = await getApiResultContent(documentId, request)
      } catch (apiErr) {
        request.logger.error(
          { err: apiErr, documentId },
          'Backend API unavailable for result content, falling back to mock data'
        )
        markdownContent = getMockResultContent(documentId)
      }

      if (!markdownContent) {
        markdownContent = 'No result content available.'
      }
    } catch (err) {
      request.logger.error(
        { err, documentId },
        'Failed to load result content from configured data source'
      )
      markdownContent = 'Error loading result content.'
    }

    return h.view('result/index', {
      pageTitle: 'Result',
      heading: 'Result',
      markdownContent
    })
  }
}
