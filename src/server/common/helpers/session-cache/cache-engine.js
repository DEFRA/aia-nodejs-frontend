import { Engine as CatboxMemory } from '@hapi/catbox-memory'

import { createLogger } from '../logging/logger.js'

export function getCacheEngine() {
  const logger = createLogger()

  logger.info('Using Catbox Memory session cache')
  return new CatboxMemory()
}
