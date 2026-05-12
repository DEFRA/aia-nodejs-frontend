import path from 'node:path'
import { readFileSync } from 'node:fs'

import { config } from '../../config.js'
import { createLogger } from '../../../server/common/helpers/logging/logger.js'

const logger = createLogger()
const assetPath = config.get('assetPath')
const manifestPath = path.join(
  config.get('root'),
  '.public/assets-manifest.json'
)

let webpackManifest

const isAuthRequired = config.get('isAuthenticationRequired')

const primaryNavLinks = [
  {
    href: '/cost',
    text: 'Cost Usage',
    enabled: config.get('features.showCostUsage')
  },
  {
    href: '/documents',
    text: 'Policy Documents',
    enabled: config.get('features.showPolicyDocuments')
  }
]

export function context(request) {
  if (!webpackManifest) {
    try {
      webpackManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch (error) {
      logger.error(`Webpack ${path.basename(manifestPath)} not found`)
    }
  }

  const currentPath = request?.path ?? ''
  const isUnauthPage = currentPath === '/' || currentPath === '/signout'

  const defaultNavigation = isUnauthPage
    ? []
    : [
        ...primaryNavLinks
          .filter((item) => item.enabled)
          .map(({ enabled: _, ...item }) => ({
            ...item,
            active: currentPath === item.href
          })),
        ...(isAuthRequired ? [{ href: '/signout', text: 'Sign out' }] : [])
      ]

  return {
    assetPath: `${assetPath}/assets`,
    serviceName: config.get('serviceName'),
    maxUploadFileSizeBytes: config.get('upload.maxFileSizeMb') * 1024 * 1024,
    serviceUrl: '/home',
    breadcrumbs: [],
    isAuthenticationRequired: isAuthRequired,
    defaultNavigation,
    getAssetPath(asset) {
      const webpackAssetPath = webpackManifest?.[asset]
      return `${assetPath}/${webpackAssetPath ?? asset}`
    }
  }
}
