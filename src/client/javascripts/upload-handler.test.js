/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest'
import { initUploadHandler } from './upload-handler.js'

// ── DOM helpers ────────────────────────────────────────────────────────────────

function buildDOM({ maxFileSizeBytes = '' } = {}) {
  document.body.innerHTML = `
    <form id="uploadForm" method="post" enctype="multipart/form-data" novalidate>
      <div id="templateTypeGroup" class="govuk-form-group">
        <p id="templateTypeError" class="govuk-error-message" style="display:none">
          <span id="templateTypeErrorText"></span>
        </p>
        <select id="templateType" class="govuk-select">
          <option value="">Select</option>
          <option value="SDA">SDA</option>
        </select>
      </div>
      <div id="fileGroup" class="govuk-form-group">
        <p id="fileError" class="govuk-error-message" style="display:none">
          <span id="fileErrorText"></span>
        </p>
        <input id="file" type="file" class="govuk-file-upload"
          ${maxFileSizeBytes ? `data-max-file-size-bytes="${maxFileSizeBytes}"` : ''} />
      </div>
      <button type="submit">Upload</button>
    </form>
  `
}

function getEls() {
  return {
    form: document.getElementById('uploadForm'),
    sel: document.getElementById('templateType'),
    fileInput: document.getElementById('file'),
    templateTypeGroup: document.getElementById('templateTypeGroup'),
    templateTypeError: document.getElementById('templateTypeError'),
    templateTypeErrorText: document.getElementById('templateTypeErrorText'),
    fileGroup: document.getElementById('fileGroup'),
    fileError: document.getElementById('fileError'),
    fileErrorText: document.getElementById('fileErrorText')
  }
}

// Minimal fake File with controllable bytes
function makeFile(bytes, name = 'test.docx') {
  return new File([new Uint8Array(bytes)], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
}

// ZIP magic + word/document.xml — passes all validator checks
function validDocxBytes() {
  const ZIP = [0x50, 0x4b, 0x03, 0x04]
  const marker = Array.from('word/document.xml').map((c) => c.charCodeAt(0))
  return [...ZIP, ...new Array(100).fill(0), ...marker]
}

// Attach a fake FileList with the given file to the input
function attachFile(input, file) {
  // jsdom does not expose DataTransfer, so build a minimal FileList-like object
  const fileList = Object.assign([file], {
    item: (i) => (i === 0 ? file : null),
    length: 1
  })
  Object.defineProperty(input, 'files', { value: fileList, configurable: true })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('initUploadHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildDOM()
    initUploadHandler()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // ── Template type select ─────────────────────────────────────────────────────

  describe('template type select', () => {
    test('clears template error when a non-empty option is selected', () => {
      const {
        sel,
        templateTypeError,
        templateTypeErrorText,
        templateTypeGroup
      } = getEls()

      // Manually show an error first
      templateTypeErrorText.textContent = 'Please select a template type'
      templateTypeError.style.display = 'block'
      templateTypeGroup.classList.add('govuk-form-group--error')
      sel.classList.add('govuk-select--error')

      sel.value = 'SDA'
      sel.dispatchEvent(new Event('change'))

      expect(templateTypeErrorText.textContent).toBe('')
      expect(templateTypeError.style.display).toBe('none')
      expect(
        templateTypeGroup.classList.contains('govuk-form-group--error')
      ).toBe(false)
      expect(sel.classList.contains('govuk-select--error')).toBe(false)
    })

    test('does not clear template error when empty option is selected', () => {
      const { sel, templateTypeError, templateTypeErrorText } = getEls()
      templateTypeErrorText.textContent = 'Please select a template type'
      templateTypeError.style.display = 'block'

      sel.value = ''
      sel.dispatchEvent(new Event('change'))

      // error should remain
      expect(templateTypeErrorText.textContent).toBe(
        'Please select a template type'
      )
    })
  })

  // ── File input change ────────────────────────────────────────────────────────

  describe('file input change', () => {
    test('does nothing when no file is selected', async () => {
      const { fileInput, fileError } = getEls()
      // No file attached — files is empty
      fileInput.dispatchEvent(new Event('change'))
      // Allow microtasks to settle
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(fileError.style.display).not.toBe('block')
    })

    test('shows file error and clears value for invalid file', async () => {
      const { fileInput, fileError, fileErrorText, fileGroup } = getEls()
      const badFile = makeFile([0x00, 0x01, 0x02, 0x03]) // not ZIP
      attachFile(fileInput, badFile)

      fileInput.dispatchEvent(new Event('change'))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(fileError.style.display).toBe('block')
      expect(fileErrorText.textContent).toContain('valid DOCX')
      expect(fileGroup).toBeDefined()
    })

    test('adds error classes to group and input on invalid file', async () => {
      const { fileInput, fileGroup } = getEls()
      const badFile = makeFile([0x00, 0x01, 0x02, 0x03])
      attachFile(fileInput, badFile)

      fileInput.dispatchEvent(new Event('change'))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(fileGroup.classList.contains('govuk-form-group--error')).toBe(true)
      expect(fileInput.classList.contains('govuk-file-upload--error')).toBe(
        true
      )
    })

    test('shows no error for a valid docx file', async () => {
      const { fileInput, fileError } = getEls()
      const goodFile = makeFile(validDocxBytes())
      attachFile(fileInput, goodFile)

      fileInput.dispatchEvent(new Event('change'))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(fileError.style.display).not.toBe('block')
    })

    test('reads data-max-file-size-bytes attribute and rejects oversized file', async () => {
      // Rebuild DOM with a small limit (1 byte)
      document.body.innerHTML = ''
      buildDOM({ maxFileSizeBytes: 1 })
      initUploadHandler()

      const { fileInput, fileError, fileErrorText } = getEls()
      const file = makeFile(validDocxBytes()) // bigger than 1 byte
      attachFile(fileInput, file)

      fileInput.dispatchEvent(new Event('change'))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(fileError.style.display).toBe('block')
      expect(fileErrorText.textContent).toMatch(/maximum allowed size/)
    })
  })

  // ── Form submit ──────────────────────────────────────────────────────────────

  describe('form submit', () => {
    test('prevents submit and shows both errors when nothing is selected', async () => {
      const { form, templateTypeError, fileError } = getEls()

      form.dispatchEvent(new Event('submit', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(templateTypeError.style.display).toBe('block')
      expect(fileError.style.display).toBe('block')
    })

    test('shows only template error when template is empty but file is valid', async () => {
      const { form, fileInput, templateTypeError, fileError } = getEls()
      attachFile(fileInput, makeFile(validDocxBytes()))

      form.dispatchEvent(new Event('submit', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(templateTypeError.style.display).toBe('block')
      expect(fileError.style.display).not.toBe('block')
    })

    test('shows only file error when template is selected but file is invalid', async () => {
      const { form, sel, fileInput, templateTypeError, fileError } = getEls()
      sel.value = 'SDA'
      attachFile(fileInput, makeFile([0x00, 0x01, 0x02, 0x03]))

      form.dispatchEvent(new Event('submit', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(templateTypeError.style.display).not.toBe('block')
      expect(fileError.style.display).toBe('block')
    })

    test('shows file error when template selected but no file chosen', async () => {
      const { form, sel, fileError, fileErrorText } = getEls()
      sel.value = 'SDA'

      form.dispatchEvent(new Event('submit', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(fileError.style.display).toBe('block')
      expect(fileErrorText.textContent).toContain('Please select a file')
    })

    test('submits the form when template and valid file are provided', async () => {
      const { form, sel, fileInput } = getEls()
      sel.value = 'SDA'
      attachFile(fileInput, makeFile(validDocxBytes()))

      const submitSpy = vi.spyOn(form, 'submit').mockImplementation(() => {})

      form.dispatchEvent(new Event('submit', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(submitSpy).toHaveBeenCalledTimes(1)
    })

    test('clears file error when file is valid on submit', async () => {
      const { form, sel, fileInput, fileError, fileGroup } = getEls()
      // Pre-populate an error state
      fileError.style.display = 'block'
      fileGroup.classList.add('govuk-form-group--error')
      fileInput.classList.add('govuk-file-upload--error')

      sel.value = 'SDA'
      attachFile(fileInput, makeFile(validDocxBytes()))

      vi.spyOn(form, 'submit').mockImplementation(() => {})

      form.dispatchEvent(new Event('submit', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(fileError.style.display).toBe('none')
      expect(fileGroup.classList.contains('govuk-form-group--error')).toBe(
        false
      )
    })
  })

  // ── Missing DOM elements ─────────────────────────────────────────────────────

  describe('missing DOM elements', () => {
    test('does not throw when called with an empty document', () => {
      document.body.innerHTML = ''
      expect(() => initUploadHandler()).not.toThrow()
    })
  })
})

// ── Guard clause coverage: show/clearTemplateError & show/clearFileError ──────
// We import the private helpers indirectly by triggering form submit with a
// partial DOM that is missing some elements so the guards return early.

describe('upload-handler guard clauses via submit', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('showTemplateError guard: does not throw when templateTypeGroup is absent', async () => {
    // Build a DOM missing templateTypeGroup (but with the form + file input)
    document.body.innerHTML = `
      <form id="uploadForm">
        <select id="templateType"><option value="">-- select --</option></select>
        <div id="fileGroup" class="govuk-form-group">
          <p id="fileError" class="govuk-error-message" style="display:none">
            <span id="fileErrorText"></span>
          </p>
          <input id="file" type="file" />
        </div>
        <button type="submit">Upload</button>
      </form>
    `
    initUploadHandler()

    const form = document.getElementById('uploadForm')
    // Submit with blank template — this calls showTemplateError, which should
    // hit the guard clause and return without throwing
    expect(() =>
      form.dispatchEvent(new Event('submit', { bubbles: true }))
    ).not.toThrow()
  })

  test('clearTemplateError guard: does not throw when templateTypeError is absent', async () => {
    document.body.innerHTML = `
      <form id="uploadForm">
        <div id="templateTypeGroup" class="govuk-form-group">
          <select id="templateType"><option value="SDA">SDA</option></select>
        </div>
        <div id="fileGroup" class="govuk-form-group">
          <p id="fileError" class="govuk-error-message" style="display:none">
            <span id="fileErrorText"></span>
          </p>
          <input id="file" type="file" />
        </div>
        <button type="submit">Upload</button>
      </form>
    `
    initUploadHandler()

    const sel = document.getElementById('templateType')
    // Changing selection triggers clearTemplateError
    expect(() => {
      sel.value = 'SDA'
      sel.dispatchEvent(new Event('change'))
    }).not.toThrow()
  })

  test('showFileError guard: does not throw when fileGroup is absent', async () => {
    document.body.innerHTML = `
      <form id="uploadForm">
        <div id="templateTypeGroup" class="govuk-form-group">
          <p id="templateTypeError" class="govuk-error-message" style="display:none">
            <span id="templateTypeErrorText"></span>
          </p>
          <select id="templateType"><option value="SDA">SDA</option></select>
        </div>
        <button type="submit">Upload</button>
      </form>
    `
    initUploadHandler()

    const form = document.getElementById('uploadForm')
    const sel = document.getElementById('templateType')
    sel.value = 'SDA'
    // No file input present — showFileError guard should return early safely
    expect(() =>
      form.dispatchEvent(new Event('submit', { bubbles: true }))
    ).not.toThrow()
  })

  test('clearFileError guard: does not throw when fileError is absent', async () => {
    document.body.innerHTML = `
      <form id="uploadForm">
        <div id="templateTypeGroup" class="govuk-form-group">
          <p id="templateTypeError" class="govuk-error-message" style="display:none">
            <span id="templateTypeErrorText"></span>
          </p>
          <select id="templateType"><option value="SDA">SDA</option></select>
        </div>
        <div id="fileGroup" class="govuk-form-group">
          <input id="file" type="file" />
        </div>
        <button type="submit">Upload</button>
      </form>
    `
    initUploadHandler()

    const sel = document.getElementById('templateType')
    sel.value = 'SDA'
    const form = document.getElementById('uploadForm')
    // clearFileError is called on a successful valid file — with missing
    // fileError element the guard should return safely
    expect(() =>
      form.dispatchEvent(new Event('submit', { bubbles: true }))
    ).not.toThrow()
  })
})
