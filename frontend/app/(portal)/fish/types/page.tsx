'use client'

import { useEffect, useRef, useState } from 'react'
import { fishAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Pencil, Upload, Fish, Tag, Info, Trash2, Layers } from 'lucide-react'
import Image from 'next/image'

interface FishType {
  id: string
  code: string
  name: string
  description: string
  aliases: string
  photo_url?: string
  photo_path?: string
  is_active: boolean
  is_sorted: boolean
  source_fish_type_id?: string
  source_fish_type_code?: string
  grade?: string
  created_at: string
}

export default function FishTypesPage() {
  const [types, setTypes] = useState<FishType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'all' | 'raw' | 'sorted'>('all')

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FishType | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FishType | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formAliases, setFormAliases] = useState('')
  const [formIsSorted, setFormIsSorted] = useState(false)
  const [formSourceId, setFormSourceId] = useState('')
  const [formGrade, setFormGrade] = useState('')
  const [saving, setSaving] = useState(false)

  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetId = useRef<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fishAPI.getTypes() as { data: FishType[] }
      setTypes(res.data || [])
    } catch {
      toast.error('Gagal memuat jenis ikan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const rawTypes = types.filter(t => !t.is_sorted)

  const openCreate = (presetSourceId?: string) => {
    setEditing(null)
    setFormCode('')
    setFormName('')
    setFormDesc('')
    setFormAliases('')
    setFormIsSorted(!!presetSourceId)
    setFormSourceId(presetSourceId || '')
    setFormGrade('')
    setOpen(true)
  }

  const openEdit = (ft: FishType) => {
    setEditing(ft)
    setFormCode(ft.code)
    setFormName(ft.name)
    setFormDesc(ft.description || '')
    setFormAliases(ft.aliases || '')
    setFormIsSorted(ft.is_sorted)
    setFormSourceId(ft.source_fish_type_id || '')
    setFormGrade(ft.grade || '')
    setOpen(true)
  }

  const handleSave = async () => {
    if (!formCode.trim() || !formName.trim()) {
      toast.error('Kode dan nama wajib diisi')
      return
    }
    if (formIsSorted && !formSourceId) {
      toast.error('Pilih ikan asal untuk varian sortir')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await fishAPI.updateType(editing.id, {
          name: formName.trim(),
          description: formDesc.trim(),
          aliases: formAliases.trim(),
        })
        toast.success('Jenis ikan diperbarui')
      } else {
        await fishAPI.createType({
          code: formCode.trim().toUpperCase(),
          name: formName.trim(),
          description: formDesc.trim(),
          aliases: formAliases.trim(),
          is_sorted: formIsSorted,
          source_fish_type_id: formIsSorted ? formSourceId : undefined,
          grade: formGrade.trim(),
        })
        toast.success('Jenis ikan ditambahkan')
      }
      setOpen(false)
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await fishAPI.deleteType(confirmDelete.id)
      toast.success(`${confirmDelete.code} dihapus`)
      setConfirmDelete(null)
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus')
    } finally {
      setDeleting(false)
    }
  }

  const triggerPhotoUpload = (id: string) => {
    uploadTargetId.current = id
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const id = uploadTargetId.current
    if (!file || !id) return
    e.target.value = ''
    setUploadingId(id)
    try {
      await fishAPI.uploadPhoto(id, file)
      toast.success('Foto berhasil diunggah')
      await load()
    } catch {
      toast.error('Gagal mengunggah foto')
    } finally {
      setUploadingId(null)
      uploadTargetId.current = null
    }
  }

  const searchLower = search.toLowerCase()
  const filtered = types.filter(ft => {
    if (viewMode === 'raw' && ft.is_sorted) return false
    if (viewMode === 'sorted' && !ft.is_sorted) return false
    if (!searchLower) return true
    return (
      ft.code.toLowerCase().includes(searchLower) ||
      ft.name.toLowerCase().includes(searchLower) ||
      (ft.aliases || '').toLowerCase().includes(searchLower) ||
      (ft.grade || '').toLowerCase().includes(searchLower)
    )
  })

  // Group sorted variants under their source
  const rawFiltered = filtered.filter(t => !t.is_sorted)
  const sortedBySource: Record<string, FishType[]> = {}
  filtered.filter(t => t.is_sorted).forEach(t => {
    const key = t.source_fish_type_id || '__none__'
    if (!sortedBySource[key]) sortedBySource[key] = []
    sortedBySource[key].push(t)
  })

  const renderCard = (ft: FishType, indent = false) => (
    <div
      key={ft.id}
      className={`group relative rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow ${indent ? 'ml-4 border-dashed border-cyan-200' : ''}`}
    >
      {ft.is_sorted && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-cyan-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
          <Layers className="h-2.5 w-2.5" />
          {ft.grade || 'Sortir'}
        </div>
      )}
      <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {ft.photo_url ? (
          <Image src={ft.photo_url} alt={ft.name} fill className="object-cover" unoptimized />
        ) : (
          <Fish className="h-12 w-12 text-muted-foreground/30" />
        )}
        <button
          onClick={() => triggerPhotoUpload(ft.id)}
          disabled={uploadingId === ft.id}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 group-hover:bg-black/40 transition-colors text-transparent group-hover:text-white text-xs font-medium"
        >
          {uploadingId === ft.id ? (
            <span className="text-white text-xs">Mengunggah...</span>
          ) : (
            <><Upload className="h-5 w-5" /><span>Ganti Foto</span></>
          )}
        </button>
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-sm font-bold text-primary">{ft.code}</span>
          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => openEdit(ft)} className="p-1 rounded hover:bg-muted" title="Edit">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button onClick={() => setConfirmDelete(ft)} className="p-1 rounded hover:bg-red-50" title="Hapus">
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </button>
          </div>
        </div>
        <p className="text-sm font-medium leading-tight mt-0.5">{ft.name}</p>
        {ft.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ft.description}</p>
        )}
        {ft.aliases && (
          <div className="mt-2 flex flex-wrap gap-1">
            {ft.aliases.split(',').map(a => a.trim()).filter(Boolean).map(alias => (
              <span key={alias} className="inline-flex items-center gap-0.5 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-800">
                <Tag className="h-2.5 w-2.5" />{alias}
              </span>
            ))}
          </div>
        )}
        {ft.is_sorted && ft.source_fish_type_code && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            dari <span className="font-mono font-semibold">{ft.source_fish_type_code}</span>
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Jenis Ikan</h2>
          <p className="text-sm text-muted-foreground">
            Master data jenis ikan mentah dan varian sortir (grade)
          </p>
        </div>
        <Button size="sm" onClick={() => openCreate()} className="gap-2">
          <Plus className="h-4 w-4" /> Tambah Jenis
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Cari kode, nama, grade, alias..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex rounded-lg border overflow-hidden text-sm">
          {(['all', 'raw', 'sorted'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {mode === 'all' ? 'Semua' : mode === 'raw' ? 'Mentah' : 'Sortir'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Varian sortir</strong>: ikan mentah (cth. SSK PC) setelah disortir menjadi grade — cth. <strong>SSK PC 2UP, SSK PC 3UP</strong>.
          Gunakan halaman <strong>Sortir Ikan</strong> untuk mencatat proses sortir dan memindahkan stok.
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card animate-pulse">
              <div className="aspect-square bg-muted rounded-t-xl" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-16 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Fish className="h-10 w-10 mb-3 opacity-30" />
          <p>{search ? 'Tidak ada hasil untuk pencarian ini' : 'Belum ada jenis ikan.'}</p>
        </div>
      ) : viewMode === 'sorted' ? (
        // Flat list for sorted view
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(ft => renderCard(ft))}
        </div>
      ) : (
        // Grouped: raw fish + their sorted variants nested below
        <div className="space-y-6">
          {rawFiltered.map(raw => (
            <div key={raw.id}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {renderCard(raw)}
                {(sortedBySource[raw.id] || []).map(sv => renderCard(sv, true))}
                {/* Add sorted variant button */}
                <button
                  onClick={() => openCreate(raw.id)}
                  className="rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-2 p-4 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors aspect-square"
                >
                  <Layers className="h-6 w-6" />
                  <span className="text-xs text-center">+ Grade {raw.code}</span>
                </button>
              </div>
            </div>
          ))}
          {/* Sorted with no matching raw (orphaned) */}
          {sortedBySource['__none__'] && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">Varian tanpa sumber</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {sortedBySource['__none__'].map(sv => renderCard(sv))}
              </div>
            </div>
          )}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* Add/Edit modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Jenis Ikan' : 'Tambah Jenis Ikan'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Is sorted toggle — only on create */}
            {!editing && (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <input
                  id="is_sorted"
                  type="checkbox"
                  checked={formIsSorted}
                  onChange={e => { setFormIsSorted(e.target.checked); if (!e.target.checked) setFormSourceId('') }}
                  className="h-4 w-4 rounded"
                />
                <label htmlFor="is_sorted" className="text-sm font-medium cursor-pointer">
                  Varian sortir (grade dari ikan mentah)
                </label>
              </div>
            )}

            {formIsSorted && (
              <div className="space-y-1">
                <Label>Ikan Asal <span className="text-red-500">*</span></Label>
                <Select value={formSourceId} onValueChange={setFormSourceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih ikan mentah..." />
                  </SelectTrigger>
                  <SelectContent>
                    {rawTypes.map(rt => (
                      <SelectItem key={rt.id} value={rt.id}>{rt.code} — {rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formIsSorted && (
              <div className="space-y-1">
                <Label>Grade</Label>
                <Input
                  value={formGrade}
                  onChange={e => setFormGrade(e.target.value)}
                  placeholder="2UP, 3UP, Super, Medium..."
                />
                <p className="text-xs text-muted-foreground">Ukuran/kelas sortir (opsional)</p>
              </div>
            )}

            <div className="space-y-1">
              <Label>Kode <span className="text-red-500">*</span></Label>
              <Input
                value={formCode}
                onChange={e => setFormCode(e.target.value.toUpperCase())}
                placeholder="SSK PC 2UP, BH 3UP..."
                disabled={!!editing}
                className="font-mono"
              />
              {editing && <p className="text-xs text-muted-foreground">Kode tidak dapat diubah setelah dibuat</p>}
            </div>
            <div className="space-y-1">
              <Label>Nama <span className="text-red-500">*</span></Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="SSK PC 2 Up, Baronang 3 Up..."
              />
            </div>
            <div className="space-y-1">
              <Label>Alias OCR</Label>
              <Input
                value={formAliases}
                onChange={e => setFormAliases(e.target.value)}
                placeholder="SSK 2UP, SSK2UP, SSK-2UP"
              />
              <p className="text-xs text-muted-foreground">Kode alternatif dari foto bon. Pisahkan dengan koma.</p>
            </div>
            <div className="space-y-1">
              <Label>Keterangan</Label>
              <Textarea
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="Catatan tambahan..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div>
              {editing && (
                <Button
                  variant="ghost" size="sm"
                  className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => { setOpen(false); setConfirmDelete(editing) }}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Hapus
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Jenis Ikan?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Jenis ikan <span className="font-semibold text-foreground">{confirmDelete?.code} — {confirmDelete?.name}</span> akan dihapus dari master data.
            Data stok dan transaksi yang sudah ada tidak akan terhapus.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Menghapus...' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
