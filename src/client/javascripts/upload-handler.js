/**
 * upload-handler.js
 *
 * Handles the document upload form on the home page:
 *   - Inline error display for file validation
 *   - Client-side DOCX file validation (zero byte, corrupted, password protected)
 *   - Template type custom validity message
 *   - Form submit orchestration
 *
 * Exported as initUploadHandler() and called from application.js only when
 * the upload form is present on the page.
 */

import { validateDocxFile } from './file-validator.js'

// ── Error summary helper ───────────────────────────────────────────────────────

function updateErrorSummary() {
  const summary = document.getElementById('errorSummary')
  const list = document.getElementById('errorSummaryList')
  if (!summary || !list) return

  const errors = []
  const templateErr = document.getElementById('templateTypeError')
  const templateErrText = document.getElementById('templateTypeErrorText')
  if (templateErr && !templateErr.hidden && templateErrText?.textContent) {
    errors.push({ href: '#templateType', text: templateErrText.textContent })
  }
  const fileErr = document.getElementById('fileError')
  const fileErrText = document.getElementById('fileErrorText')
  if (fileErr && !fileErr.hidden && fileErrText?.textContent) {
    errors.push({ href: '#file', text: fileErrText.textContent })
  }

  list.innerHTML = errors
    .map((e) => `<li><a href="${e.href}">${e.text}</a></li>`)
    .join('')

  if (errors.length > 0) {
    summary.hidden = false
    summary.style.display = 'block'
    summary.focus()
  } else {
    summary.hidden = true
    summary.style.display = 'none'
  }
}

// ── Error display helpers ──────────────────────────────────────────────────────

function showTemplateError(message) {
  const group = document.getElementById('templateTypeGroup')
  const errMsg = document.getElementById('templateTypeError')
  const errText = document.getElementById('templateTypeErrorText')
  const sel = document.getElementById('templateType')

  if (!group || !errMsg || !errText || !sel) return

  errText.textContent = message
  errMsg.hidden = false
  errMsg.style.display = 'block'
  group.classList.add('govuk-form-group--error')
  sel.classList.add('govuk-select--error')
}

function clearTemplateError() {
  const group = document.getElementById('templateTypeGroup')
  const errMsg = document.getElementById('templateTypeError')
  const errText = document.getElementById('templateTypeErrorText')
  const sel = document.getElementById('templateType')

  if (!group || !errMsg || !errText || !sel) return

  errText.textContent = ''
  errMsg.hidden = true
  errMsg.style.display = 'none'
  group.classList.remove('govuk-form-group--error')
  sel.classList.remove('govuk-select--error')
}

function showFileError(message) {
  const group = document.getElementById('fileGroup')
  const errMsg = document.getElementById('fileError')
  const errText = document.getElementById('fileErrorText')
  const input = document.getElementById('file')

  if (!group || !errMsg || !errText || !input) return

  errText.textContent = message
  errMsg.hidden = false
  errMsg.style.display = 'block'
  group.classList.add('govuk-form-group--error')
  input.classList.add('govuk-file-upload--error')
}

function clearFileError() {
  const group = document.getElementById('fileGroup')
  const errMsg = document.getElementById('fileError')
  const errText = document.getElementById('fileErrorText')
  const input = document.getElementById('file')

  if (!group || !errMsg || !errText || !input) return

  errText.textContent = ''
  errMsg.hidden = true
  errMsg.style.display = 'none'
  group.classList.remove('govuk-form-group--error')
  input.classList.remove('govuk-file-upload--error')
}

// ── Main init — called once when the upload form is present ───────────────────

export function initUploadHandler() {
  const sel = document.getElementById('templateType')
  const form = document.getElementById('uploadForm')
  const fileInput = document.getElementById('file')

  const maxFileSizeBytesRaw = fileInput?.dataset?.maxFileSizeBytes
  const maxFileSizeBytes = maxFileSizeBytesRaw
    ? Number(maxFileSizeBytesRaw)
    : undefined

  // ── Template type: clear inline error on change ────────────────────────────
  if (sel) {
    sel.addEventListener('change', function () {
      if (sel.value !== '') clearTemplateError()
    })
  }

  // ── File input: validate on selection ─────────────────────────────────────
  if (fileInput) {
    fileInput.addEventListener('change', async function () {
      clearFileError()
      const file = this.files[0]
      if (!file) return

      const result = await validateDocxFile(file, { maxFileSizeBytes })
      if (!result.valid) {
        showFileError(result.message)
        this.value = '' // clear so the invalid file cannot be submitted
      }
      updateErrorSummary()
    })
  }

  // ── Form submit ───────────────────────────────────────────────────────────
  if (form) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault()

      let hasError = false

      // Validate template type
      if (!sel || sel.value === '') {
        showTemplateError('Please select a template type')
        hasError = true
      } else {
        clearTemplateError()
      }

      // Validate file
      const input = document.getElementById('file')
      const file = input && input.files[0]

      if (!file) {
        showFileError('Please select a file')
        hasError = true
      } else {
        try {
          const result = await validateDocxFile(file, { maxFileSizeBytes })
          if (!result.valid) {
            showFileError(result.message)
            hasError = true
          } else {
            clearFileError()
          }
        } catch {
          showFileError('Unable to validate the file. Please try again.')
          hasError = true
        }
      }

      if (hasError) {
        updateErrorSummary()
        return
      }

      form.submit()
    })
  }
}
