import { Button, Input, Textarea } from '@cherrystudio/ui'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { WorkshopProjectCreateInput } from '@shared/types/workshop'
import { FolderOpen, GitBranch, Landmark } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface WorkshopWelcomeProps {
  busy: boolean
  recentProjectRoot?: string
  onCreate: (values: WorkshopProjectCreateInput) => Promise<void>
  onOpen: (rootPath: string) => Promise<void>
}

export function WorkshopWelcome({ busy, recentProjectRoot, onCreate, onOpen }: WorkshopWelcomeProps) {
  const { t } = useTranslation()
  const [parentDirectory, setParentDirectory] = useState('')
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [premise, setPremise] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const openProjectRoot = async (rootPath: string) => {
    setErrorMessage('')
    try {
      await onOpen(rootPath)
    } catch (error) {
      setErrorMessage(formatErrorMessageWithPrefix(error, t('workshop.errors.open_project')))
    }
  }

  const chooseParentDirectory = async () => {
    setErrorMessage('')
    const selected = await window.api.file.selectFolder()
    if (selected) setParentDirectory(selected)
  }

  const chooseProjectToOpen = async () => {
    const selected = await window.api.file.selectFolder()
    if (selected) await openProjectRoot(selected)
  }

  const createProject = async () => {
    const normalizedTitle = title.trim()
    if (!parentDirectory || !normalizedTitle) return
    const normalizedGenre = genre.trim()
    const normalizedPremise = premise.trim()
    setErrorMessage('')
    try {
      await onCreate({
        parentDirectory,
        title: normalizedTitle,
        ...(normalizedGenre ? { genre: normalizedGenre } : {}),
        ...(normalizedPremise ? { premise: normalizedPremise } : {})
      })
    } catch (error) {
      setErrorMessage(formatErrorMessageWithPrefix(error, t('workshop.errors.create_project')))
    }
  }

  return (
    <main data-ui="workshop.welcome" className="h-full overflow-auto bg-background px-6 py-10">
      <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-between gap-10 bg-background-subtle p-8">
            <div className="space-y-5">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Landmark className="size-6" aria-hidden />
              </div>
              <div className="space-y-2">
                <h1 className="font-semibold text-2xl tracking-tight">{t('workshop.welcome.title')}</h1>
                <p className="max-w-md text-muted-foreground text-sm leading-6">{t('workshop.welcome.description')}</p>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <GitBranch className="size-4 text-primary" aria-hidden />
                <span>{t('workshop.welcome.feature_versioning')}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={busy}
                onClick={chooseProjectToOpen}>
                <FolderOpen className="size-4" aria-hidden />
                {t('workshop.welcome.open_existing')}
              </Button>
              {recentProjectRoot ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full min-w-0 justify-start px-2 py-1.5 text-left"
                  disabled={busy}
                  onClick={() => void openProjectRoot(recentProjectRoot)}>
                  <span className="min-w-0">
                    <span className="block text-muted-foreground text-xs">{t('workshop.welcome.open_recent')}</span>
                    <span className="block truncate text-xs">{recentProjectRoot}</span>
                  </span>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-5 p-8">
            <div className="space-y-1">
              <h2 className="font-medium text-lg">{t('workshop.create.title')}</h2>
              <p className="text-muted-foreground text-sm">{t('workshop.create.description')}</p>
            </div>

            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="font-medium text-sm">{t('workshop.create.parent_directory')}</span>
                <div className="flex gap-2">
                  <Input
                    value={parentDirectory}
                    onChange={(event) => setParentDirectory(event.target.value)}
                    placeholder={t('workshop.create.parent_directory_placeholder')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={t('workshop.create.choose_parent_directory')}
                    disabled={busy}
                    onClick={() => void chooseParentDirectory()}>
                    <FolderOpen className="size-4" aria-hidden />
                  </Button>
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="font-medium text-sm">{t('workshop.create.book_title')}</span>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t('workshop.create.book_title_placeholder')}
                  autoFocus
                />
              </label>

              <label className="block space-y-1.5">
                <span className="font-medium text-sm">{t('workshop.create.genre')}</span>
                <Input
                  value={genre}
                  onChange={(event) => setGenre(event.target.value)}
                  placeholder={t('workshop.create.genre_placeholder')}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="font-medium text-sm">{t('workshop.create.premise')}</span>
                <Textarea.Input
                  value={premise}
                  onChange={(event) => setPremise(event.target.value)}
                  placeholder={t('workshop.create.premise_placeholder')}
                  className="min-h-24 resize-y"
                />
              </label>
            </div>

            {errorMessage ? (
              <p role="alert" className="rounded-md bg-error-subtle px-3 py-2 text-error-subtle-foreground text-sm">
                {errorMessage}
              </p>
            ) : null}

            <Button
              type="button"
              size="lg"
              className="w-full"
              loading={busy}
              disabled={!parentDirectory || !title.trim()}
              onClick={() => void createProject()}>
              {t('workshop.create.submit')}
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}
