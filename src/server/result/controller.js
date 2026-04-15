/**
 * A GDS styled example result page controller.
 * Provided as an example, remove or modify as required.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { config } from '../../config/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const RESULT2_DOC_ID = 'UUID-1234-5678-9012-abcdef123456'

function resolveMockFileName(docID) {
  return docID === RESULT2_DOC_ID ? 'result2.json' : 'result.json'
}

function parseJsonPayload(payload) {
  if (payload == null) {
    return null
  }

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

  if (typeof parsedPayload === 'string') {
    return parsedPayload
  }

  if (!parsedPayload || typeof parsedPayload !== 'object') {
    return ''
  }

  const candidates = [parsedPayload, parsedPayload.result, parsedPayload.data]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }

    if (typeof candidate.markdownContent === 'string') {
      return candidate.markdownContent
    }

    if (typeof candidate.markdown === 'string') {
      return candidate.markdown
    }

    if (
      Array.isArray(candidate.content) &&
      typeof candidate.content[0]?.text === 'string'
    ) {
      return candidate.content[0].text
    }
  }

  return ''
}

function getMockResultContent(docID) {
  const mockFileName = resolveMockFileName(docID)
  const resultsDataRaw = readFileSync(`${__dirname}/${mockFileName}`, 'utf8')
  const resultsData = JSON.parse(resultsDataRaw)
  return extractMarkdownContent(resultsData)
}

async function getApiResultContent(docID) {
  const apiUrl = config.get('result.apiUrl')

  if (!apiUrl) {
    throw new Error('RESULT_API_URL is not configured')
  }

  const timeoutMs = config.get('result.apiTimeoutMs')
  const timeoutController = new AbortController()
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs)

  try {
    const requestUrl = new URL(apiUrl)
    if (docID) {
      requestUrl.searchParams.set('docID', docID)
    }

    const response = await fetch(requestUrl, {
      method: 'GET',
      signal: timeoutController.signal,
      headers: {
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(
        `Result API request failed with status ${response.status}`
      )
    }

    const bodyText = await response.text()
    return extractMarkdownContent(bodyText)
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export const resultController = {
  async handler(request, h) {
    const docID = request.query.docID
    let markdownContent = ''

    try {
      if (config.get('result.mockData')) {
        markdownContent = getMockResultContent(docID)
      } else {
        markdownContent = await getApiResultContent(docID)
      }

      if (!markdownContent) {
        markdownContent = 'No result content available.'
      }
    } catch (err) {
      request.logger.error(
        { err, docID },
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
