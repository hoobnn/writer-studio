import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { ConsoleMessage, Page } from '@playwright/test'

import { expect, test } from '../fixtures/electron.fixture'
import { uiLocator } from '../utils'

async function closeWriterSurfacesBeforeCleanup(mainWindow: Page): Promise<void> {
  const continuityReviewDialog = uiLocator(mainWindow, 'writer.continuity-review.dialog')
  if (await continuityReviewDialog.isVisible()) {
    await continuityReviewDialog.getByRole('button', { name: 'Close' }).first().click()
    await expect(continuityReviewDialog).toBeHidden()
  }

  const lorebookDialog = uiLocator(mainWindow, 'writer.lorebook.dialog')
  if (await lorebookDialog.isVisible()) {
    await lorebookDialog.getByRole('button', { name: 'Close' }).first().click()
    const discardButton = mainWindow.getByRole('button', { name: 'Discard and close' })
    const needsDiscard = await discardButton
      .waitFor({ state: 'visible', timeout: 500 })
      .then(() => true)
      .catch(() => false)
    if (needsDiscard) await discardButton.click()
    await expect(lorebookDialog).toBeHidden()
  }

  const documentsDialog = uiLocator(mainWindow, 'writer.documents.dialog')
  if (await documentsDialog.isVisible()) {
    await documentsDialog.getByRole('button', { name: 'Close' }).first().click()
    await expect(documentsDialog).toBeHidden()
  }

  const workspace = uiLocator(mainWindow, 'writer.view')
  if (await workspace.isVisible()) {
    await workspace.getByRole('button', { name: 'Close project' }).click()
    await expect(workspace).toBeHidden()
    await expect(uiLocator(mainWindow, 'writer.welcome')).toBeVisible()
  }
}

test.describe('Writer workspace', () => {
  test('creates a portable project and opens its writing documents', async ({ mainWindow }) => {
    const parentDirectory = await mkdtemp(path.join(tmpdir(), 'cherry-writer-e2e-'))
    const rendererErrors: string[] = []
    const recordPageError = (error: Error) => rendererErrors.push(error.message)
    const recordConsoleError = (message: ConsoleMessage) => {
      if (message.type() === 'error') rendererErrors.push(message.text())
    }
    mainWindow.on('pageerror', recordPageError)
    mainWindow.on('console', recordConsoleError)

    try {
      const welcome = uiLocator(mainWindow, 'writer.welcome')
      const existingWorkspace = uiLocator(mainWindow, 'writer.view')
      const onboardingLanguage = mainWindow.locator('[data-onboarding-language-select]')
      await expect(welcome.or(onboardingLanguage).or(existingWorkspace)).toBeVisible()
      if (await onboardingLanguage.isVisible()) {
        await onboardingLanguage.getByRole('combobox').click()
        await mainWindow.getByRole('option', { name: 'English' }).click()
        await mainWindow.getByRole('button', { name: 'Set up later' }).click()
      } else if (await existingWorkspace.isVisible()) {
        await existingWorkspace.getByRole('button', { name: 'Close project' }).click()
        await expect(existingWorkspace).toBeHidden()
      }

      await expect(welcome).toBeVisible()
      await mainWindow.evaluate(() => window.api.preference.set('app.language', 'en-US'))
      const projectLocation = welcome.getByRole('textbox', { name: /^Project location/ })
      await expect(projectLocation).toBeVisible()
      await projectLocation.fill(parentDirectory)
      await welcome.getByRole('textbox', { name: 'Book title' }).fill('Writer E2E Novel')
      await welcome.getByRole('textbox', { name: 'Genre' }).fill('Mystery')
      await welcome.getByRole('spinbutton', { name: 'Target length' }).fill('120000')
      await welcome
        .getByRole('textbox', { name: 'Creative premise' })
        .fill('A locked room promise must be paid before dawn.')
      await welcome.getByRole('button', { name: 'Create project' }).click()

      const workspace = uiLocator(mainWindow, 'writer.view')
      await expect(workspace).toBeVisible()
      await expect(workspace.getByRole('heading', { name: 'Writer E2E Novel' })).toBeVisible()
      const projectEntries = (await readdir(parentDirectory, { withFileTypes: true })).filter((entry) =>
        entry.isDirectory()
      )
      expect(projectEntries).toHaveLength(1)
      const [projectEntry] = projectEntries
      if (!projectEntry) throw new Error('Writer project directory was not created')
      const projectRoot = path.join(parentDirectory, projectEntry.name)

      await workspace.getByRole('button', { name: 'Manage writing documents' }).click()
      const documentsDialog = uiLocator(mainWindow, 'writer.documents.dialog')
      await expect(documentsDialog).toBeVisible()
      await expect(documentsDialog.getByRole('tab', { name: /Story Bible/ })).toBeVisible()
      await expect(documentsDialog.getByRole('tabpanel', { name: 'Story Bible' })).toContainText(
        'A locked room promise must be paid before dawn.'
      )
      await documentsDialog.getByRole('button', { name: 'Close' }).first().click()
      await expect(documentsDialog).toBeHidden()

      await workspace.getByRole('button', { name: 'Manage lorebook' }).click()
      const lorebookDialog = uiLocator(mainWindow, 'writer.lorebook.dialog')
      await expect(lorebookDialog).toBeVisible()
      await lorebookDialog.locator('[data-ui~="writer.lorebook.add"]').click()
      await lorebookDialog.getByRole('textbox', { name: 'Entry title' }).fill('The Brass Key')
      await lorebookDialog.getByRole('textbox', { name: 'Activation keys' }).fill('brass key\nsealed door')
      await lorebookDialog
        .getByRole('textbox', { name: 'Lore content' })
        .fill('The brass key opens the sealed archive beneath the observatory.')
      await lorebookDialog.getByRole('button', { name: 'Save' }).click()
      await expect
        .poll(async () => {
          const storyBible = JSON.parse(
            await readFile(path.join(projectRoot, '.cherry-writer', 'story-bible.json'), 'utf8')
          )
          return storyBible.loreEntries.length
        })
        .toBe(1)
      await expect(lorebookDialog.getByText('The Brass Key', { exact: true })).toBeVisible()
      await lorebookDialog.getByRole('button', { name: 'Close' }).first().click()
      await expect(lorebookDialog).toBeHidden()

      const manifestPath = path.join(projectRoot, '.cherry-writer', 'project.json')
      const outlinePath = path.join(projectRoot, '.cherry-writer', 'outline.json')
      const continuityPath = path.join(projectRoot, '.cherry-writer', 'continuity.json')
      const continuityReviewPath = path.join(projectRoot, '.cherry-writer', 'continuity-review.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      const outline = JSON.parse(await readFile(outlinePath, 'utf8'))
      const continuity = JSON.parse(await readFile(continuityPath, 'utf8'))
      const activeChapterId = manifest.activeChapterId
      const activeChapter = manifest.chapters.find((chapter: { id: string }) => chapter.id === activeChapterId)
      if (!activeChapter) throw new Error('Writer active chapter was not persisted')
      outline.chapterPlans[0].requirements = [
        { id: 'required-sealed-door', description: 'The protagonist opens the sealed door.' }
      ]
      continuity.chapterSummaries = [
        {
          chapterId: activeChapterId,
          summary: 'The protagonist walks away from the sealed door.',
          assessmentRevision: activeChapter.revision,
          requirementAssessments: [
            {
              requirementId: 'required-sealed-door',
              status: 'deviated',
              evidence: 'The chapter ends before the door is opened.'
            }
          ],
          updatedAt: new Date().toISOString()
        }
      ]
      await writeFile(outlinePath, `${JSON.stringify(outline, null, 2)}\n`, 'utf8')
      await writeFile(continuityPath, `${JSON.stringify(continuity, null, 2)}\n`, 'utf8')

      await workspace.getByRole('button', { name: 'Review continuity' }).click()
      const continuityReviewDialog = uiLocator(mainWindow, 'writer.continuity-review.dialog')
      await expect(continuityReviewDialog).toBeVisible()
      await continuityReviewDialog.locator('[data-ui~="writer.continuity-review.run"]').click()
      await expect(
        continuityReviewDialog.getByText('Chapter draft deviates from its plan', { exact: true })
      ).toBeVisible()
      await continuityReviewDialog
        .getByRole('textbox', { name: 'Why this is intentional' })
        .fill('The retreat is an intentional reversal before the midpoint reveal.')
      await continuityReviewDialog.locator('[data-ui~="writer.continuity-review.waive"]').click()
      await expect
        .poll(async () => {
          const review = JSON.parse(await readFile(continuityReviewPath, 'utf8'))
          return review.waivers.length
        })
        .toBe(1)
      await continuityReviewDialog.getByRole('button', { name: 'Close' }).first().click()
      await expect(continuityReviewDialog).toBeHidden()

      await workspace.getByRole('button', { name: 'Review continuity' }).click()
      await expect(continuityReviewDialog).toBeVisible()
      await expect(
        continuityReviewDialog.getByText('The retreat is an intentional reversal before the midpoint reveal.', {
          exact: true
        })
      ).toBeVisible()
      await continuityReviewDialog.locator('[data-ui~="writer.continuity-review.unwaive"]').click()
      await expect
        .poll(async () => {
          const review = JSON.parse(await readFile(continuityReviewPath, 'utf8'))
          return review.waivers.length
        })
        .toBe(0)
      await continuityReviewDialog.getByRole('button', { name: 'Close' }).first().click()
      await expect(continuityReviewDialog).toBeHidden()

      const screenshotsDirectory = path.join(process.cwd(), 'test-results', 'screenshots')
      await mkdir(screenshotsDirectory, { recursive: true })
      await mainWindow.screenshot({
        path: path.join(screenshotsDirectory, 'writer-workspace.png'),
        fullPage: true
      })

      expect(manifest).toMatchObject({ title: 'Writer E2E Novel', targetWordCount: 120000 })
      const storyBible = JSON.parse(
        await readFile(path.join(projectRoot, '.cherry-writer', 'story-bible.json'), 'utf8')
      )
      expect(storyBible.loreEntries).toEqual([
        expect.objectContaining({
          title: 'The Brass Key',
          keys: ['brass key', 'sealed door'],
          content: 'The brass key opens the sealed archive beneath the observatory.'
        })
      ])
      const manuscriptFiles = await readdir(path.join(projectRoot, 'manuscript'))
      expect(manuscriptFiles.some((file) => file.endsWith('.md'))).toBe(true)

      await workspace.getByRole('button', { name: 'Close project' }).click()
      await expect(workspace).toBeHidden()
      await expect(welcome).toBeVisible()
      expect(rendererErrors).toEqual([])
    } finally {
      try {
        await closeWriterSurfacesBeforeCleanup(mainWindow)
        await rm(parentDirectory, { recursive: true, force: true })
      } finally {
        mainWindow.off('pageerror', recordPageError)
        mainWindow.off('console', recordConsoleError)
      }
    }
  })
})
