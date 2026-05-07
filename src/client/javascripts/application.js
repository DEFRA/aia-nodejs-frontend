import {
  createAll,
  Button,
  Checkboxes,
  ErrorSummary,
  PasswordInput,
  Radios,
  SkipLink
} from 'govuk-frontend'

import { initUploadHandler } from './upload-handler.js'
import { createPoller } from './status-poller.js'

createAll(Button)
createAll(Checkboxes)
createAll(ErrorSummary)
createAll(PasswordInput)
createAll(Radios)
createAll(SkipLink)

if (document.getElementById('uploadForm')) {
  initUploadHandler()
}

function getTableProcessingCount() {
  return document.querySelectorAll(
    '#uploadHistoryTable [data-document-status="PROCESSING"]'
  ).length
}

function initStatusPolling() {
  const table = document.getElementById('uploadHistoryTable')
  if (!table) return
  if (getTableProcessingCount() === 0) return

  const intervalMs = parseInt(table.dataset.pollIntervalMs, 10) || 30000
  const maxPolls = parseInt(table.dataset.pollMaxPolls, 10) || 20

  const poller = createPoller({
    intervalMs,
    maxPolls,
    onResult(processingDocumentIds) {
      const tableCount = getTableProcessingCount()
      if (tableCount === 0) {
        poller.stop()
        return
      }
      if (processingDocumentIds.length === 0) {
        poller.stop()
        window.location.reload()
      }
    },
    onTimeout() {
      const notice = document.getElementById('pollingTimeoutNotice')
      if (notice) notice.removeAttribute('hidden')
    }
  })

  poller.start()
}

initStatusPolling()
