import { Button, Input, Textarea } from '@cherrystudio/ui'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { WriterProjectCreateInput } from '@shared/types/writer'
import { BookOpenText, FolderOpen, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface WriterWelcomeProps {
  busy: boolean
  recentProjectRoot?: string
  onCreate: (values: WriterProjectCreateInput) => Promise<void>
  onOpen: (rootPath: string) => Promise<void>
}

export function WriterWelcome({ busy, recentProjectRoot, onCreate, onOpen }: WriterWelcomeProps) {
  const { t } = useTranslation()
  const [parentDirectory, setParentDirectory] = useState('')
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [premise, setPremise] = useState('')
  const [targetWordCount, setTargetWordCount] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const openProjectRoot = async (rootPath: string) => {
    setErrorMessage('')
    try {
      await onOpen(rootPath)
    } catch (error) {
      setErrorMessage(formatErrorMessageWithPrefix(error, t('writer.errors.open_project')))
    }
  }

  const chooseParentDirectory = async () => {
    setErrorMessage('')
    try {
      const selected = await window.api.file.selectFolder()
      if (selected) setParentDirectory(selected)
    } catch (error) {
      setErrorMessage(formatErrorMessageWithPrefix(error, t('writer.errors.create_project')))
    }
  }

  const chooseProjectToOpen = async () => {
    setErrorMessage('')
    try {
      const selected = await window.api.file.selectFolder()
      if (selected) await openProjectRoot(selected)
    } catch (error) {
      setErrorMessage(formatErrorMessageWithPrefix(error, t('writer.errors.open_project')))
    }
  }

  const createProject = async () => {
    const normalizedTitle = title.trim()
    if (!parentDirectory || !normalizedTitle) return

    const normalizedGenre = genre.trim()
    const normalizedPremise = premise.trim()
    const parsedTargetWordCount = Number(targetWordCount)
    const values: WriterProjectCreateInput = {
      parentDirectory,
      title: normalizedTitle,
      ...(normalizedGenre ? { genre: normalizedGenre } : {}),
      ...(normalizedPremise ? { premise: normalizedPremise } : {}),
      ...(Number.isInteger(parsedTargetWordCount) && parsedTargetWordCount > 0
        ? { targetWordCount: parsedTargetWordCount }
        : {})
    }

    setErrorMessage('')
    try {
      await onCreate(values)
    } catch (error) {
      setErrorMessage(formatErrorMessageWithPrefix(error, t('writer.errors.create_project')))
    }
  }

  return (
    <main data-ui="writer.welcome" className="h-full overflow-auto bg-background px-6 py-10">
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid-cols-[0.85fr_1.15fr]">
          <div className="flex flex-col justify-between gap-10 bg-background-subtle p-8 lg:p-10">
            <div className="space-y-5">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <BookOpenText className="size-6" aria-hidden />
              </div>
              <div className="space-y-2">
                <h1 className="font-semibold text-2xl tracking-tight">{t('writer.welcome.title')}</h1>
                <p className="max-w-md text-muted-foreground text-sm leading-6">{t('writer.welcome.description')}</p>
              </div>
              <div className="grid gap-2 text-muted-foreground text-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" aria-hidden />
                  <span>{t('writer.welcome.feature_context')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" aria-hidden />
                  <span>{t('writer.welcome.feature_proposals')}</span>
                </div>
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
                {t('writer.welcome.open_existing')}
              </Button>
              {recentProjectRoot ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full min-w-0 justify-start px-2 py-1.5 text-left"
                  disabled={busy}
                  onClick={() => void openProjectRoot(recentProjectRoot)}>
                  <span className="min-w-0">
                    <span className="block text-muted-foreground text-xs">{t('writer.welcome.open_recent')}</span>
                    <span className="block truncate text-xs">{recentProjectRoot}</span>
                  </span>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-5 p-8 lg:p-10">
            <div className="space-y-1">
              <h2 className="font-medium text-lg">{t('writer.create.title')}</h2>
              <p className="text-muted-foreground text-sm">{t('writer.create.description')}</p>
            </div>

            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="font-medium text-sm">{t('writer.create.parent_directory')}</span>
                <div className="flex gap-2">
                  <Input
                    value={parentDirectory}
                    onChange={(event) => setParentDirectory(event.target.value)}
                    placeholder={t('writer.create.parent_directory_placeholder')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={t('writer.create.choose_parent_directory')}
                    disabled={busy}
                    onClick={chooseParentDirectory}>
                    <FolderOpen className="size-4" aria-hidden />
                  </Button>
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="font-medium text-sm">{t('writer.create.book_title')}</span>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t('writer.create.book_title_placeholder')}
                  autoFocus
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="font-medium text-sm">{t('writer.create.genre')}</span>
                  <Input
                    value={genre}
                    onChange={(event) => setGenre(event.target.value)}
                    placeholder={t('writer.create.genre_placeholder')}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="font-medium text-sm">{t('writer.create.target_word_count')}</span>
                  <Input
                    type="number"
                    min={1}
                    value={targetWordCount}
                    onChange={(event) => setTargetWordCount(event.target.value)}
                    placeholder={t('writer.create.target_word_count_placeholder')}
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="font-medium text-sm">{t('writer.create.premise')}</span>
                <Textarea.Input
                  value={premise}
                  onChange={(event) => setPremise(event.target.value)}
                  placeholder={t('writer.create.premise_placeholder')}
                  className="min-h-24 resize-y"
                />
              </label>
            </div>

            {errorMessage ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                {errorMessage}
              </p>
            ) : null}

            <Button
              type="button"
              size="lg"
              className="w-full"
              loading={busy}
              disabled={!parentDirectory || !title.trim()}
              onClick={createProject}>
              {t('writer.create.submit')}
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}
