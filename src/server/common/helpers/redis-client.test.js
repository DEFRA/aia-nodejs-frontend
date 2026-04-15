import { vi } from 'vitest'

import { Cluster, Redis } from 'ioredis'

import { config } from '../../../config/config.js'
import { buildRedisClient } from './redis-client.js'

// Capture event listeners so we can fire them in tests
let capturedListeners = {}

vi.mock('ioredis', () => ({
  ...vi.importActual('ioredis'),
  Cluster: vi.fn(function () {
    return {
      on: (event, cb) => {
        capturedListeners[event] = cb
      }
    }
  }),
  Redis: vi.fn(function () {
    return {
      on: (event, cb) => {
        capturedListeners[event] = cb
      }
    }
  })
}))

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('./logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  })
}))

describe('#buildRedisClient', () => {
  beforeEach(() => {
    capturedListeners = {}
    vi.clearAllMocks()
  })

  describe('When Redis Single InstanceCache is requested', () => {
    beforeEach(() => {
      buildRedisClient({ ...config.get('redis'), useSingleInstanceCache: true })
    })

    test('Should instantiate a single Redis client', () => {
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          db: 0,
          host: '127.0.0.1',
          keyPrefix: 'aia-frontend:',
          port: 6379
        })
      )
    })

    test('Should not instantiate a Redis Cluster', () => {
      expect(Cluster).not.toHaveBeenCalled()
    })

    test('Should log info message on connect event', () => {
      capturedListeners['connect']()
      expect(mockLoggerInfo).toHaveBeenCalledWith('Connected to Redis server')
    })

    test('Should log error message on error event', () => {
      capturedListeners['error'](new Error('connection refused'))
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Redis client error: connection refused'
      )
    })
  })

  describe('When a Redis Cluster is requested', () => {
    beforeEach(() => {
      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: false,
        useTLS: true,
        username: 'user',
        password: 'pass'
      })
    })

    test('Should instantiate a Redis Cluster client', () => {
      expect(Cluster).toHaveBeenCalledWith(
        [{ host: '127.0.0.1', port: 6379 }],
        {
          dnsLookup: expect.any(Function),
          keyPrefix: 'aia-frontend:',
          redisOptions: { db: 0, password: 'pass', tls: {}, username: 'user' },
          slotsRefreshTimeout: 10000
        }
      )
    })

    test('Should not instantiate a single Redis client', () => {
      expect(Redis).not.toHaveBeenCalled()
    })

    test('Should log info message on connect event', () => {
      capturedListeners['connect']()
      expect(mockLoggerInfo).toHaveBeenCalledWith('Connected to Redis server')
    })

    test('Should log error message on error event', () => {
      capturedListeners['error'](new Error('cluster error'))
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Redis client error: cluster error'
      )
    })

    test('dnsLookup callback passes address through', () => {
      const callArgs = Cluster.mock.calls[0][1]
      const callback = vi.fn()
      callArgs.dnsLookup('my-host', callback)
      expect(callback).toHaveBeenCalledWith(null, 'my-host')
    })
  })

  describe('When no credentials are provided', () => {
    test('Should not include username/password in Redis options', () => {
      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: true,
        username: '',
        password: ''
      })
      expect(Redis).toHaveBeenCalledWith(
        expect.not.objectContaining({ username: expect.anything() })
      )
    })
  })

  describe('When a single Redis instance is requested with TLS enabled', () => {
    test('Should pass tls option to the Redis constructor', () => {
      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: true,
        useTLS: true
      })

      expect(Redis).toHaveBeenCalledWith(expect.objectContaining({ tls: {} }))
    })
  })

  describe('When a single Redis instance is requested with TLS disabled', () => {
    test('Should NOT pass tls option to the Redis constructor', () => {
      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: true,
        useTLS: false
      })

      expect(Redis).toHaveBeenCalledWith(
        expect.not.objectContaining({ tls: expect.anything() })
      )
    })
  })
})
