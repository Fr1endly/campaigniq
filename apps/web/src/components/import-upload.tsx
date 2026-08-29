import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  createImportResponseSchema,
  importRunSchema,
} from '@campaign-iq/contracts'
import type { ImportRun } from '@campaign-iq/contracts'
import {
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'
import { ImportStatusBadge } from '@/components/import-status-badge'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/formatters'
import { cn } from '@/lib/utils'

const MAX_FILE_BYTES = 50 * 1024 * 1024
const terminalStatuses = new Set(['completed', 'failed'])

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[]
  } | null
  if (Array.isArray(body?.message)) return body.message.join(', ')
  return body?.message ?? `Request failed (${response.status})`
}

function putFile(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    Object.entries(headers).forEach(([name, value]) =>
      request.setRequestHeader(name, value),
    )
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100))
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error(`Object upload failed (${request.status})`))
    })
    request.addEventListener('error', () =>
      reject(new Error('Object storage is unavailable')),
    )
    request.send(file)
  })
}

export function ImportUpload() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [activeImport, setActiveImport] = useState<ImportRun | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activeImport || terminalStatuses.has(activeImport.status)) return
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/imports/${activeImport.id}`)
        if (!response.ok) throw new Error(await responseError(response))
        const next = importRunSchema.parse(await response.json())
        setActiveImport(next)
        if (terminalStatuses.has(next.status)) {
          setBusy(false)
          await router.invalidate()
        }
      } catch (pollError) {
        setError(
          pollError instanceof Error
            ? pollError.message
            : 'Unable to refresh import status',
        )
      }
    }, 1000)
    return () => window.clearTimeout(timeout)
  }, [activeImport, router])

  function selectFile(next: File | undefined) {
    setError('')
    if (!next) return
    if (!next.name.toLowerCase().endsWith('.csv')) {
      setError('Choose a CSV file.')
      return
    }
    if (next.size === 0) {
      setError('The selected CSV is empty.')
      return
    }
    if (next.size > MAX_FILE_BYTES) {
      setError('CSV files must be 50 MB or smaller.')
      return
    }
    setFile(next)
    setActiveImport(null)
    setProgress(0)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    selectFile(event.dataTransfer.files[0])
  }

  async function startImport() {
    if (!file) return
    setBusy(true)
    setError('')
    setProgress(0)
    let createdImportId: string | undefined
    try {
      const contentType = [
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
      ].includes(file.type)
        ? file.type
        : 'text/csv'
      const createResponse = await fetch('/api/imports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType,
          size: file.size,
        }),
      })
      if (!createResponse.ok)
        throw new Error(await responseError(createResponse))
      const created = createImportResponseSchema.parse(
        await createResponse.json(),
      )
      createdImportId = created.import.id
      setActiveImport(created.import)
      await putFile(
        created.upload.url,
        file,
        created.upload.headers,
        setProgress,
      )

      const processResponse = await fetch(
        `/api/imports/${created.import.id}/process`,
        {
          method: 'POST',
        },
      )
      if (!processResponse.ok)
        throw new Error(await responseError(processResponse))
      setActiveImport(importRunSchema.parse(await processResponse.json()))
    } catch (uploadError) {
      setBusy(false)
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Import could not be started',
      )
      if (createdImportId) {
        const failedResponse = await fetch(
          `/api/imports/${createdImportId}/upload-failed`,
          {
            method: 'POST',
          },
        ).catch(() => null)
        if (failedResponse?.ok) {
          setActiveImport(importRunSchema.parse(await failedResponse.json()))
        }
      }
      await router.invalidate()
    }
  }

  const completed = activeImport?.status === 'completed'

  return (
    <section
      className="border-b bg-card px-4 py-5 sm:px-6"
      aria-labelledby="upload-heading"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)] lg:items-center">
        <div>
          <h2 id="upload-heading" className="text-base font-semibold">
            Upload campaign data
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Canonical CSV format, up to 50 MB. Valid rows load even when other
            rows are rejected.
          </p>
          <div
            className={cn(
              'mt-4 flex min-h-28 items-center justify-center border border-dashed p-4 text-center transition-colors',
              dragging
                ? 'border-emerald-600 bg-emerald-50'
                : 'border-border bg-muted/30',
            )}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => selectFile(event.target.files?.[0])}
              aria-label="Choose CSV file"
            />
            {file ? (
              <div className="flex w-full max-w-lg items-center gap-3 text-left">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
                  <FileSpreadsheet className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </span>
                {!busy && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFile(null)}
                    aria-label="Remove selected file"
                  >
                    <X />
                  </Button>
                )}
              </div>
            ) : (
              <div>
                <Upload className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Drop a CSV here</p>
                <Button
                  variant="link"
                  className="mt-1"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose file
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 border-l-0 lg:border-l lg:pl-6">
          {activeImport ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">
                  {activeImport.filename}
                </p>
                <ImportStatusBadge status={activeImport.status} />
              </div>
              {activeImport.status === 'uploading' && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Direct upload</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-600 transition-[width]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
              {completed && (
                <div className="mt-4 flex items-start gap-2 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Loaded {formatNumber(activeImport.loadedRows)} rows;
                    rejected {formatNumber(activeImport.rejectedRows)}.
                    Analytics now reflect the completed load.
                  </p>
                </div>
              )}
              {activeImport.status === 'failed' && (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  {activeImport.errorMessage ?? 'Import processing failed.'}
                </p>
              )}
              {(activeImport.status === 'received' ||
                activeImport.status === 'processing') && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Validating and loading rows. This page can remain open while
                  processing completes.
                </p>
              )}
              {terminalStatuses.has(activeImport.status) && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setActiveImport(null)
                    setFile(null)
                    setProgress(0)
                  }}
                >
                  <RefreshCw />
                  Import another file
                </Button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">Ready to import</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The file uploads directly to local object storage, then enters
                ETL processing.
              </p>
              <Button
                className="mt-4"
                disabled={!file || busy}
                onClick={startImport}
              >
                <Upload />
                Upload and process
              </Button>
            </div>
          )}
          {error && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
