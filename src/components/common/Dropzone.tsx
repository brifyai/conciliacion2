import { useCallback, useRef, useState } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'

interface DropzoneProps {
  accept?: string
  onFiles: (files: File[]) => void
  disabled?: boolean
}

const ACCEPT_DEFAULT = '.csv,.txt,.xlsx,.xls'

export function Dropzone({ accept = ACCEPT_DEFAULT, onFiles, disabled }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragging(false)
      if (disabled) return
      const files = Array.from(e.dataTransfer.files)
      if (files.length) onFiles(files)
    },
    [disabled, onFiles],
  )

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) onFiles(files)
    e.target.value = '' // permite volver a subir el mismo archivo
  }

  return (
    <Box
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragging(false)
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click()
      }}
      sx={{
        border: '2px dashed',
        borderColor: dragging ? 'primary.main' : '#C7D0E0',
        borderRadius: 3,
        bgcolor: dragging ? '#F0F4FF' : '#FAFBFD',
        p: { xs: 4, md: 6 },
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all .2s ease',
        '&:hover': { borderColor: disabled ? '#C7D0E0' : 'primary.main', bgcolor: '#F5F8FF' },
        outline: 'none',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={handleSelect}
      />
      <Stack alignItems="center" spacing={1.5}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: dragging ? 'primary.main' : '#E8EEFF',
            color: dragging ? '#fff' : 'primary.main',
            display: 'grid',
            placeItems: 'center',
            transition: 'all .2s ease',
          }}
        >
          <CloudUploadRoundedIcon sx={{ fontSize: 32 }} />
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Arrastra tu archivo aquí
        </Typography>
        <Typography variant="body2" color="text.secondary">
          o haz clic para seleccionar · CSV, XLSX o XLS
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Extracto bancario o libro contable
        </Typography>
      </Stack>
    </Box>
  )
}
