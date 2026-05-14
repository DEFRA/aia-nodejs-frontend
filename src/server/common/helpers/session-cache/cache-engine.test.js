import { vi } from 'vitest'

import { Engine as CatboxMemory } from '@hapi/catbox-memory'

import { getCacheEngine } from './cache-engine.js'

const mockLoggerInfo = vi.fn()

vi.mock('@hapi/catbox-memory')
vi.mock('../logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args)
  })
}))

describe('#getCacheEngine', () => {
  describe('When cache engine is requested', () => {
    beforeEach(() => {
      getCacheEngine('memory')
    })

    test('Should setup Memory cache', () => {
      expect(CatboxMemory).toHaveBeenCalled()
    })

    test('Should log expected Memory message', () => {
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Using Catbox Memory session cache'
      )
    })
  })
})
