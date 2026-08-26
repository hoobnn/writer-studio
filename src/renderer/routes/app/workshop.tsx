import { WorkshopPage } from '@renderer/features/workshop'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/workshop')({
  component: WorkshopPage
})
