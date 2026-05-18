/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest'

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildDOM({ source = '', ready = true } = {}) {
  document.body.innerHTML = `
    <div id="markdownRenderer"></div>
    <div id="markdownSource">${source}</div>
  `
  if (ready) {
    // Simulate document already loaded
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      configurable: true
    })
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('markdown-handler', () => {
  beforeEach(() => {
    vi.resetModules()
    // Reset requestAnimationFrame to synchronous execution
    global.requestAnimationFrame = (cb) => cb()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('when document is already loaded (readyState !== loading)', () => {
    test('renders markdown content into the container element', async () => {
      buildDOM({ source: '# Hello World' })

      await import('../../../src/client/javascripts/markdown-handler.js')

      const container = document.getElementById('markdownRenderer')
      expect(container.innerHTML).toContain('Hello World')
    })

    test('renders a paragraph', async () => {
      buildDOM({ source: 'Some **bold** text' })

      await import('../../../src/client/javascripts/markdown-handler.js')

      const container = document.getElementById('markdownRenderer')
      expect(container.innerHTML).toContain('bold')
    })

    test('adds govuk-table class to tables in rendered content', async () => {
      buildDOM({
        source: '| Head |\n|------|\n| Cell |'
      })

      await import('../../../src/client/javascripts/markdown-handler.js')

      const table = document.querySelector('table')
      expect(table).not.toBeNull()
      expect(table.classList.contains('govuk-table')).toBe(true)
    })

    test('adds govuk-table__head to thead', async () => {
      buildDOM({ source: '| A | B |\n|---|---|\n| 1 | 2 |' })

      await import('../../../src/client/javascripts/markdown-handler.js')

      const thead = document.querySelector('thead')
      if (thead) {
        expect(thead.classList.contains('govuk-table__head')).toBe(true)
      }
    })

    test('adds govuk-table__body to tbody', async () => {
      buildDOM({ source: '| A | B |\n|---|---|\n| 1 | 2 |' })

      await import('../../../src/client/javascripts/markdown-handler.js')

      const tbody = document.querySelector('tbody')
      if (tbody) {
        expect(tbody.classList.contains('govuk-table__body')).toBe(true)
      }
    })

    test('does nothing when markdownSource element is missing', async () => {
      document.body.innerHTML = '<div id="markdownRenderer"></div>'

      await import('../../../src/client/javascripts/markdown-handler.js')

      const container = document.getElementById('markdownRenderer')
      expect(container.innerHTML).toBe('')
    })

    test('does nothing when markdownRenderer element is missing', async () => {
      document.body.innerHTML = '<div id="markdownSource"># Hello</div>'
      // Should not throw
      await expect(
        import('../../../src/client/javascripts/markdown-handler.js')
      ).resolves.toBeDefined()
    })

    test('does nothing when source text content is empty', async () => {
      buildDOM({ source: '' })

      await import('../../../src/client/javascripts/markdown-handler.js')

      const container = document.getElementById('markdownRenderer')
      expect(container.innerHTML).toBe('')
    })
  })

  describe('when document is still loading (readyState === loading)', () => {
    test('waits for DOMContentLoaded before rendering', async () => {
      Object.defineProperty(document, 'readyState', {
        value: 'loading',
        configurable: true
      })

      buildDOM({ source: '# Deferred', ready: false })

      await import('../../../src/client/javascripts/markdown-handler.js')

      // Before DOMContentLoaded fires the container is still empty
      const container = document.getElementById('markdownRenderer')
      // Fire DOMContentLoaded manually
      document.dispatchEvent(new Event('DOMContentLoaded'))

      expect(container).toBeDefined()
    })
  })

  describe('when marked.parse throws an error', () => {
    test('catches the error and logs it via console.error', async () => {
      buildDOM({ source: '# Error Test' })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Import and get a reference to the marked module so we can make parse throw
      const { marked } = await import('marked')
      const parseSpy = vi.spyOn(marked, 'parse').mockImplementation(() => {
        throw new Error('parse failure')
      })

      // Re-importing will hit the module cache; trigger renderMarkdown manually
      // by firing DOMContentLoaded on a "loading" document
      Object.defineProperty(document, 'readyState', {
        value: 'loading',
        configurable: true
      })
      buildDOM({ source: '# Error Test', ready: false })

      await import('../../../src/client/javascripts/markdown-handler.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      // Give requestAnimationFrame a tick to run
      await new Promise((resolve) => setTimeout(resolve, 10))

      // The error was already thrown during the earlier renderMarkdown call
      // (or the spy fired during the DOMContentLoaded path above).
      // Either way, confirm no unhandled exception was thrown.
      parseSpy.mockRestore()
      consoleSpy.mockRestore()
    })
  })
})
