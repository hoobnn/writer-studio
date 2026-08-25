import type { ElectronApplication, Page } from '@playwright/test'
import { _electron as electron, expect as playwrightExpect, test as base } from '@playwright/test'
import { DISTRIBUTION } from '../../../src/shared/utils/distribution'

/**
 * Custom fixtures for Electron e2e testing.
 * Provides electronApp and mainWindow to all tests.
 */
export type ElectronFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, provide) => {
    // Launch Electron app from project root
    // The args ['.'] tells Electron to load the app from current directory
    const electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'development'
      },
      timeout: 60000
    })

    await provide(electronApp)

    // Cleanup: close the app after test
    await electronApp.close()
  },

  mainWindow: async ({ electronApp }, provide) => {
    // Wait for the main window (title: the distribution product name, not "Quick Assistant")
    // On Mac, the app may create the QuickAssistant window with a different title
    const findMainWindow = async (): Promise<Page | undefined> => {
      for (const window of electronApp.windows()) {
        if ((await window.title()) === DISTRIBUTION.productName) {
          return window
        }
      }
      return undefined
    }
    await playwrightExpect.poll(findMainWindow, { timeout: 60000 }).toBeTruthy()
    const mainWindow = await findMainWindow()
    if (!mainWindow) {
      throw new Error(`${DISTRIBUTION.productName} main window did not become available`)
    }

    // Wait for React app to mount
    await mainWindow.waitForSelector('#root', { state: 'attached', timeout: 60000 })

    // Wait for initial content to load
    await mainWindow.waitForLoadState('domcontentloaded')

    await provide(mainWindow)
  }
})

export { expect } from '@playwright/test'
