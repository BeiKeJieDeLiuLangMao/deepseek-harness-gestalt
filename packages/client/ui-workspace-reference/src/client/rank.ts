/**
 * Browser ranking: the host algorithm, re-exported. The host package root is not
 * a client-safe import (node:fs); this subpath is.
 *
 * Portions derived from omdsh-dev/dsh-at-file 0.6.3 (MIT).
 * Copyright (c) 2026 dsh-at-file contributors. See NOTICE.
 */
export {
  rankFiles,
  type WorkspacePathEntry,
} from '@deepseek-ai/dsh-workspace-reference/src/search.ts'
