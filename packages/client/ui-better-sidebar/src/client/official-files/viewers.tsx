/** Built-in keyed viewer bodies for official file tabs. */
import type { ComponentType, ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { lazyChunkComponent } from '../lazy-chunk.tsx'
import type { TextEditorCoreProps } from '../TextEditor.tsx'
import { PdfView } from '../PdfView.tsx'
import { BinaryDownload } from '../binary-download.tsx'
import css from '../sidebar.module.css'
import type {} from './contract.ts'

/** Props common to every registered official file viewer. */
export type OfficialFileViewerProps = PropsRuntime<'sidebar.right.file.viewer'>

const LazyTextEditorCore = lazyChunkComponent<TextEditorCoreProps>(
  'editor',
  mod => mod.TextEditorCore as ComponentType<TextEditorCoreProps> | undefined,
)

/** Image body backed by the scoped raw-media route. */
export function OfficialImageViewer({ mediaUrl, title }: OfficialFileViewerProps): ReactNode {
  return (
    <div className={css.editorImageWrap} data-official-file-viewer="image">
      <img className={css.editorImage} src={mediaUrl} alt={title} />
    </div>
  )
}

/** PDF body with the existing browser viewer and download fallback. */
export function OfficialPdfViewer({ scope, path, title }: OfficialFileViewerProps): ReactNode {
  return <PdfView scope={scope} path={path} title={title} />
}

/** Markdown, HTML, and code body loaded through the shared lazy editor chunk. */
export function OfficialTextEditorViewer(props: OfficialFileViewerProps): ReactNode {
  return <LazyTextEditorCore {...props} />
}

/** Binary file body exposes a scoped download action without reading bytes into the browser. */
export function OfficialBinaryViewer({ scope, path }: OfficialFileViewerProps): ReactNode {
  return <BinaryDownload scope={scope} path={path} />
}
