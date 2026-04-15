import { vi } from 'vitest'

import { Engine as CatboxRedis } from '@hapi/catbox-redis'
import { Engine as CatboxMemory } from '@hapi/catbox-memory'

import { getCacheEngine } from './cache-engine.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('ioredis', () => ({
  ...vi.importActual('ioredis'),
  Cluster: vi.fn(function () {
    return { on: () => ({}) }
  }),
  Redis: vi.fn(function () {
    return { on: () => ({}) }
  })
}))
vi.mock('@hapi/catbox-redis')
vi.mock('@hapi/catbox-memory')
vi.mock('../logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  })
}))

describe('#getCacheEngine', () => {
  describe('When Redis cache engine has been requested', () => {
    beforeEach(() => {
      getCacheEngine('redis')
    })

    test('Should setup Redis cache', () => {
      expect(CatboxRedis).toHaveBeenCalledWith(expect.any(Object))
    })

    test('Should log expected Redis message', () => {
      expect(mockLoggerInfo).toHaveBeenCalledWith('Using Redis session cache')
    })
  })

  describe('When Memory cache engine has been requested', () => {
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

  describe('When Memory cache is used in production', () => {
    beforeEach(() => {
      vi.resetModules()
    })

    test('Should log error warning when isProduction is true and memory cache requested', async () => {
      vi.doMock('../../../../config/config.js', () => ({
        config: {
          get: vi.fn((key) => {
            if (key === 'isProduction') return true
            if (key === 'redis') {
              return {
                host: '127.0.0.1',
                username: '',
                password: '',
                keyPrefix: 'aia-frontend:',
                useSingleInstanceCache: true,
                useTLS: false
              }
            }
            return undefined
          })
        }
      }))

      const { getCacheEngine: getCacheEngineProd } =
        await import('./cache-engine.js')
      getCacheEngineProd('memory')

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Catbox Memory is for local development only, it should not be used in production!'
      )
    })
  })
})
