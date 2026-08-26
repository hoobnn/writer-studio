import { usePersistCache } from '@renderer/data/hooks/useCache'
import { ipcApi } from '@renderer/ipc'
import type { WorkshopProjectCreateInput, WorkshopProjectSnapshot } from '@shared/types/workshop'
import { useCallback, useEffect, useRef, useState } from 'react'

import { WorkshopWelcome } from './components/WorkshopWelcome'
import { WorkshopWorkspace } from './components/WorkshopWorkspace'

export function WorkshopPage() {
  const [recentProjectRoot, setRecentProjectRoot] = usePersistCache('ui.workshop.last_project_root')
  const [snapshot, setSnapshot] = useState<WorkshopProjectSnapshot>()
  const [busy, setBusy] = useState(false)
  const autoOpenAttemptedRef = useRef(false)

  const enterProject = useCallback(
    (next: WorkshopProjectSnapshot) => {
      setSnapshot(next)
      setRecentProjectRoot(next.rootPath)
    },
    [setRecentProjectRoot]
  )

  const createProject = useCallback(
    async (values: WorkshopProjectCreateInput) => {
      setBusy(true)
      try {
        enterProject(await ipcApi.request('workshop.project.create', values))
      } finally {
        setBusy(false)
      }
    },
    [enterProject]
  )

  const openProject = useCallback(
    async (rootPath: string) => {
      setBusy(true)
      try {
        enterProject(await ipcApi.request('workshop.project.open', { rootPath }))
      } finally {
        setBusy(false)
      }
    },
    [enterProject]
  )

  const refreshSnapshot = useCallback(async () => {
    if (!snapshot) return
    setSnapshot(await ipcApi.request('workshop.project.open', { rootPath: snapshot.rootPath }))
  }, [snapshot])

  useEffect(() => {
    if (autoOpenAttemptedRef.current || snapshot || !recentProjectRoot) return
    autoOpenAttemptedRef.current = true
    void openProject(recentProjectRoot).catch(() => {
      // 最近项目可能已被移动或删除；静默回到欢迎页即可。
      setRecentProjectRoot(null)
    })
  }, [openProject, recentProjectRoot, setRecentProjectRoot, snapshot])

  if (!snapshot) {
    return (
      <WorkshopWelcome
        busy={busy}
        recentProjectRoot={recentProjectRoot ?? undefined}
        onCreate={createProject}
        onOpen={openProject}
      />
    )
  }
  return (
    <WorkshopWorkspace snapshot={snapshot} onRefreshSnapshot={refreshSnapshot} onClose={() => setSnapshot(undefined)} />
  )
}
