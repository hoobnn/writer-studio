import { WriterPage } from '@renderer/features/writer'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/writer')({
  component: WriterPage
})
