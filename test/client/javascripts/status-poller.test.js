/**
 * @vitest-environment jsdom
 */

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import {
  createPoller,
  getPoller
} from '../../../src/client/javascripts/status-poller.js'

describe('status-poller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    // Stop any running poller
    const poller = getPoller()
    if (poller) poller.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('#createPoller', () => {
    test('should return a poller instance', () => {
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onResult: vi.fn()
      })

      expect(poller).toBeDefined()
      expect(poller.start).toBeInstanceOf(Function)
      expect(poller.stop).toBeInstanceOf(Function)
      expect(poller.isRunning).toBeInstanceOf(Function)
    })

    test('should stop previous poller when creating a new one', () => {
      const onResult1 = vi.fn()
      const poller1 = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onResult: onResult1
      })
      poller1.start()
      expect(poller1.isRunning()).toBe(true)

      // Creating a second poller stops the first
      createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onResult: vi.fn()
      })

      expect(poller1.isRunning()).toBe(false)
    })
  })

  describe('#getPoller', () => {
    test('should return the current poller instance', () => {
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onResult: vi.fn()
      })

      expect(getPoller()).toBe(poller)
    })
  })

  describe('#start', () => {
    test('should set isRunning to true', () => {
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onResult: vi.fn()
      })

      expect(poller.isRunning()).toBe(false)
      poller.start()
      expect(poller.isRunning()).toBe(true)
    })

    test('should not restart if already running', () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ processingDocumentIds: ['doc1'] })
      })

      const onResult = vi.fn()
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onResult
      })

      poller.start()
      poller.start() // second call should be ignored

      vi.advanceTimersByTime(1000)
      expect(onResult).not.toHaveBeenCalledTimes(2)
    })
  })

  describe('#stop', () => {
    test('should set isRunning to false', () => {
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onResult: vi.fn()
      })

      poller.start()
      poller.stop()
      expect(poller.isRunning()).toBe(false)
    })

    test('should prevent further polling after stop', async () => {
      const onResult = vi.fn()
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ processingDocumentIds: [] })
      })

      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 10,
        onResult
      })

      poller.start()
      poller.stop()

      await vi.advanceTimersByTimeAsync(5000)
      expect(onResult).not.toHaveBeenCalled()
    })
  })

  describe('polling behaviour', () => {
    test('should call fetch after intervalMs', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ processingDocumentIds: ['doc1'] })
      })

      const onResult = vi.fn()
      const poller = createPoller({
        intervalMs: 2000,
        maxPolls: 5,
        onResult
      })

      poller.start()
      expect(global.fetch).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(2000)
      expect(global.fetch).toHaveBeenCalledWith('/api/poll-status')
      expect(onResult).toHaveBeenCalledWith(['doc1'])
    })

    test('should poll repeatedly until stopped', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ processingDocumentIds: ['doc1'] })
      })

      const onResult = vi.fn()
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 10,
        onResult
      })

      poller.start()

      await vi.advanceTimersByTimeAsync(3000)
      expect(global.fetch).toHaveBeenCalledTimes(3)
      expect(onResult).toHaveBeenCalledTimes(3)
    })

    test('should call onTimeout when maxPolls exceeded', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ processingDocumentIds: ['doc1'] })
      })

      const onTimeout = vi.fn()
      const onResult = vi.fn()
      const poller = createPoller({
        intervalMs: 100,
        maxPolls: 3,
        onResult,
        onTimeout
      })

      poller.start()

      // Advance past maxPolls (3 polls + 1 that triggers timeout)
      await vi.advanceTimersByTimeAsync(100) // poll 1
      await vi.advanceTimersByTimeAsync(100) // poll 2
      await vi.advanceTimersByTimeAsync(100) // poll 3
      await vi.advanceTimersByTimeAsync(100) // poll 4 — exceeds maxPolls

      expect(onTimeout).toHaveBeenCalledTimes(1)
    })

    test('should call onError when fetch returns non-OK', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500
      })

      const onError = vi.fn()
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onError
      })

      poller.start()
      await vi.advanceTimersByTimeAsync(1000)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
      expect(onError.mock.calls[0][0].message).toBe('HTTP 500')
    })

    test('should call onError when fetch throws', async () => {
      global.fetch.mockRejectedValue(new Error('Network failure'))

      const onError = vi.fn()
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onError
      })

      poller.start()
      await vi.advanceTimersByTimeAsync(1000)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0][0].message).toBe('Network failure')
    })

    test('should continue polling after onError', async () => {
      global.fetch.mockRejectedValueOnce(new Error('fail')).mockResolvedValue({
        ok: true,
        json: async () => ({ processingDocumentIds: [] })
      })

      const onError = vi.fn()
      const onResult = vi.fn()
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onError,
        onResult
      })

      poller.start()
      await vi.advanceTimersByTimeAsync(1000) // error
      await vi.advanceTimersByTimeAsync(1000) // success

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onResult).toHaveBeenCalledTimes(1)
    })

    test('should default processingDocumentIds to empty array', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}) // no processingDocumentIds key
      })

      const onResult = vi.fn()
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onResult
      })

      poller.start()
      await vi.advanceTimersByTimeAsync(1000)

      expect(onResult).toHaveBeenCalledWith([])
    })

    test('should not call callbacks if stopped during fetch', async () => {
      let resolvePromise
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve
          })
      )

      const onResult = vi.fn()
      const poller = createPoller({
        intervalMs: 1000,
        maxPolls: 5,
        onResult
      })

      poller.start()
      await vi.advanceTimersByTimeAsync(1000) // triggers fetch

      // Stop while fetch is in-flight
      poller.stop()

      // Resolve the pending fetch
      resolvePromise({
        ok: true,
        json: async () => ({ processingDocumentIds: ['doc1'] })
      })

      await vi.advanceTimersByTimeAsync(0) // flush microtasks

      expect(onResult).not.toHaveBeenCalled()
    })
  })
})
