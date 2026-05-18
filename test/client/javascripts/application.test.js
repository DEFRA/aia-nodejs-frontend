/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest'

// ── Mock govuk-frontend ────────────────────────────────────────────────────────
// application.js calls createAll() at module-level with these components.
// We mock the whole package to avoid real DOM bindings.

const mockCreateAll = vi.fn()

vi.mock('govuk-frontend', () => ({
  createAll: mockCreateAll,
  Button: class Button {},
  Checkboxes: class Checkboxes {},
  ErrorSummary: class ErrorSummary {},
  PasswordInput: class PasswordInput {},
  Radios: class Radios {},
  SkipLink: class SkipLink {}
}))

// ── Mock upload-handler ────────────────────────────────────────────────────────
const mockInitUploadHandler = vi.fn()

vi.mock('../../../src/client/javascripts/upload-handler.js', () => ({
  initUploadHandler: mockInitUploadHandler
}))

// ── Mock status-poller ─────────────────────────────────────────────────────────
const mockPollerStart = vi.fn()
const mockPollerStop = vi.fn()
const mockCreatePoller = vi.fn(() => ({
  start: mockPollerStart,
  stop: mockPollerStop,
  isRunning: () => true
}))

vi.mock('../../../src/client/javascripts/status-poller.js', () => ({
  createPoller: mockCreatePoller
}))

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('application.js', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCreateAll.mockClear()
    mockInitUploadHandler.mockClear()
    mockCreatePoller.mockClear()
    mockPollerStart.mockClear()
    mockPollerStop.mockClear()
    // Mock window.location.reload
    delete window.location
    window.location = { reload: vi.fn() }
    window.confirm = vi.fn(() => true)
  })

  test('Should call createAll for each govuk-frontend component', async () => {
    document.body.innerHTML = ''

    await import('../../../src/client/javascripts/application.js')

    // createAll should have been called 6 times (Button, Checkboxes,
    // ErrorSummary, PasswordInput, Radios, SkipLink)
    expect(mockCreateAll).toHaveBeenCalledTimes(6)
  })

  test('Should NOT call initUploadHandler when uploadForm is absent', async () => {
    document.body.innerHTML = '<div>No upload form here</div>'

    await import('../../../src/client/javascripts/application.js')

    expect(mockInitUploadHandler).not.toHaveBeenCalled()
  })

  test('Should call initUploadHandler when uploadForm is present', async () => {
    document.body.innerHTML = '<form id="uploadForm"></form>'

    await import('../../../src/client/javascripts/application.js')

    expect(mockInitUploadHandler).toHaveBeenCalledTimes(1)
  })

  test('Should not start polling when uploadHistoryTable is absent', async () => {
    document.body.innerHTML = '<div>No table</div>'

    await import('../../../src/client/javascripts/application.js')

    expect(mockCreatePoller).not.toHaveBeenCalled()
  })

  test('Should not start polling when no PROCESSING rows exist', async () => {
    document.body.innerHTML = `
      <table id="uploadHistoryTable" data-poll-interval-ms="1000" data-poll-max-polls="5">
        <tr><td data-document-status="COMPLETE">Done</td></tr>
      </table>
    `

    await import('../../../src/client/javascripts/application.js')

    expect(mockCreatePoller).not.toHaveBeenCalled()
  })

  test('Should start polling when PROCESSING rows exist', async () => {
    document.body.innerHTML = `
      <table id="uploadHistoryTable" data-poll-interval-ms="2000" data-poll-max-polls="10">
        <tr><td data-document-status="PROCESSING">In progress</td></tr>
      </table>
    `

    await import('../../../src/client/javascripts/application.js')

    expect(mockCreatePoller).toHaveBeenCalledWith(
      expect.objectContaining({
        intervalMs: 2000,
        maxPolls: 10
      })
    )
    expect(mockPollerStart).toHaveBeenCalled()
  })

  test('Should use default intervalMs and maxPolls when data attributes missing', async () => {
    document.body.innerHTML = `
      <table id="uploadHistoryTable">
        <tr><td data-document-status="PROCESSING">In progress</td></tr>
      </table>
    `

    await import('../../../src/client/javascripts/application.js')

    expect(mockCreatePoller).toHaveBeenCalledWith(
      expect.objectContaining({
        intervalMs: 30000,
        maxPolls: 20
      })
    )
  })

  test('onResult should stop poller and reload when no processing docs remain', async () => {
    document.body.innerHTML = `
      <table id="uploadHistoryTable" data-poll-interval-ms="1000" data-poll-max-polls="5">
        <tr><td data-document-status="PROCESSING">In progress</td></tr>
      </table>
    `

    await import('../../../src/client/javascripts/application.js')

    // Get the onResult callback passed to createPoller
    const { onResult } = mockCreatePoller.mock.calls[0][0]

    // Simulate: backend says no more processing docs
    onResult([])

    expect(mockPollerStop).toHaveBeenCalled()
    expect(window.location.reload).toHaveBeenCalled()
  })

  test('onResult should stop poller when table has no PROCESSING rows', async () => {
    document.body.innerHTML = `
      <table id="uploadHistoryTable" data-poll-interval-ms="1000" data-poll-max-polls="5">
        <tr><td data-document-status="PROCESSING">In progress</td></tr>
      </table>
    `

    await import('../../../src/client/javascripts/application.js')

    const { onResult } = mockCreatePoller.mock.calls[0][0]

    // Remove the PROCESSING status from DOM before callback fires
    document
      .querySelector('[data-document-status="PROCESSING"]')
      .setAttribute('data-document-status', 'COMPLETE')

    onResult(['doc1'])

    expect(mockPollerStop).toHaveBeenCalled()
  })

  test('onTimeout should show the polling timeout notice', async () => {
    document.body.innerHTML = `
      <table id="uploadHistoryTable" data-poll-interval-ms="1000" data-poll-max-polls="5">
        <tr><td data-document-status="PROCESSING">In progress</td></tr>
      </table>
      <div id="pollingTimeoutNotice" hidden></div>
    `

    await import('../../../src/client/javascripts/application.js')

    const { onTimeout } = mockCreatePoller.mock.calls[0][0]
    onTimeout()

    const notice = document.getElementById('pollingTimeoutNotice')
    expect(notice.hasAttribute('hidden')).toBe(false)
  })

  test('Should prevent delete form submit when user cancels confirmation', async () => {
    document.body.innerHTML = `
      <form id="deleteForm" data-confirm-delete data-confirm-message="Confirm delete?">
        <button type="submit">Delete</button>
      </form>
    `

    window.confirm = vi.fn(() => false)

    await import('../../../src/client/javascripts/application.js')

    const form = document.getElementById('deleteForm')
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(submitEvent)

    expect(window.confirm).toHaveBeenCalledWith('Confirm delete?')
    expect(submitEvent.defaultPrevented).toBe(true)
  })

  test('Should allow delete form submit when user confirms', async () => {
    document.body.innerHTML = `
      <form id="deleteForm" data-confirm-delete data-confirm-message="Confirm delete?">
        <button type="submit">Delete</button>
      </form>
    `

    window.confirm = vi.fn(() => true)

    await import('../../../src/client/javascripts/application.js')

    const form = document.getElementById('deleteForm')
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(submitEvent)

    expect(window.confirm).toHaveBeenCalledWith('Confirm delete?')
    expect(submitEvent.defaultPrevented).toBe(false)
  })

  test('Should confirm delete for form added after app initialization', async () => {
    document.body.innerHTML = ''
    window.confirm = vi.fn(() => false)

    await import('../../../src/client/javascripts/application.js')

    document.body.innerHTML = `
      <form id="lateDeleteForm" data-confirm-delete data-confirm-message="Confirm late delete?">
        <button type="submit">Delete</button>
      </form>
    `

    const form = document.getElementById('lateDeleteForm')
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(submitEvent)

    expect(window.confirm).toHaveBeenCalledWith('Confirm late delete?')
    expect(submitEvent.defaultPrevented).toBe(true)
  })
})
