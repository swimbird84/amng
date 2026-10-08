import { registerWorksHandlers } from './ipc-works'
import { registerActorsHandlers } from './ipc-actors'
import { registerTagsHandlers } from './ipc-tags'
import { registerStudiosHandlers } from './ipc-studios'
import { registerSystemHandlers } from './ipc-system'
import { registerDashboardHandlers } from './ipc-dashboard'
import { registerCupHandlers } from './ipc-cup'
import { registerFilesHandlers } from './ipc-files'
import { registerTierHandlers } from './ipc-tier'

export function registerIpcHandlers(): void {
  registerWorksHandlers()
  registerActorsHandlers()
  registerTagsHandlers()
  registerStudiosHandlers()
  registerSystemHandlers()
  registerDashboardHandlers()
  registerCupHandlers()
  registerFilesHandlers()
  registerTierHandlers()
}
