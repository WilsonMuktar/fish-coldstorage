'use client'

import { useEffect, useRef, useState } from 'react'
import { fishAPI, itemAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Fish, Ship, Package, Layers, Plus, Pencil, Trash2, Upload, Tag, Info, X,
} from 'lucide-react'
import Image from 'next/image'
import { formatDate } from '@/lib/formatters'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FishType {
  id: string; code: string; name: string; description: string; aliases: string
  photo_url?: string; is_sorted: boolean; source_fish_type_id?: string
  source_fish_type_code?: string; grade?: string; is_active: boolean; created_at: string
}

interface Vessel {
  id: string; name: string; registration_no?: string; owner_name?: string
  captain_name?: string; photo_url?: string; is_active: boolean; created_at: string
}

interface ItemCategory { id: string; name: string }
interface Item {
  id: string; code: string; name: string; unit: string; category_id?: string
  category_name?: string; price_estimate: number; is_active: boolean; created_at: string
}

// ─── Tab config ───────────────────────────────────────────────────────────────
type Tab = 'fish' | 'sorted' | 'vessels' | 'items'

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'fish',    label: 'Jenis Ikan',        icon: Fish },
  { key: 'sorted',  label: 'Jenis Sortir',      icon: Layers },
  { key: 'vessels', label: 'Kapal',             icon: Ship },
  { key: 'items',   label: 'Jenis Barang',      icon: Package },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MasterPage() {
  const [tab, setTab] = useState<Tab>('fish')

  const [fishTypes, setFishTypes] = useState<FishType[]>([])
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')

  // shared modal
  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FishType | Vessel | Item | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string; type: Tab } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  // fish form
  const [ff, setFf] = useState({ code: '', name: '', description: '', aliases: '', is_sorted: false, source_id: '', grade: '' })
  // vessel form
  const [vf, setVf] = useState({ name: '', registration_no: '', captain_name: '', owner_name: '' })
  // item form
  const [itf, setItf] = useState({ code: '', name: '', unit: 'kg', category_id: '', price_estimate: '' })

  // fish photo upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetId = useRef<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  // vessel photo upload
  const vesselFileInputRef = useRef<HTMLInputElement>(null)
  const vesselUploadTargetId = useRef<string | null>(null)
  const [vesselUploadingId, setVesselUploadingId] = useState<string | null>(null)

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadAll = async () => {
    setLoading(true)
    try {
      const [ftRes, vRes, iRes, cRes] = await Promise.all([
        fishAPI.getTypes() as Promise<{ data: FishType[] }>,
        fishAPI.getVessels() as Promise<{ data: Vessel[] }>,
        itemAPI.getItems() as Promise<{ data: Item[] }>,
        itemAPI.getCategories() as Promise<{ data: ItemCategory[] }>,
      ])
      setFishTypes(ftRes.data || [])
      setVessels(vRes.data || [])
      setItems(iRes.data || [])
      setCategories(cRes.data || [])
    } catch {
      toast.error('Gagal memuat data master')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const rawFishTypes = fishTypes.filter(f => !f.is_sorted)
  const sortedFishTypes = fishTypes.filter(f => f.is_sorted)

  const filtered = (list: { name?: string; code?: string; id: string }[]) =>
    search.trim() === '' ? list : list.filter(x =>
      (x.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (x.code || '').toLowerCase().includes(search.toLowerCase())
    )

  // ── Open modals ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditTarget(null)
    if (tab === 'fish')    setFf({ code: '', name: '', description: '', aliases: '', is_sorted: false, source_id: '', grade: '' })
    if (tab === 'sorted')  setFf({ code: '', name: '', description: '', aliases: '', is_sorted: true, source_id: '', grade: '' })
    if (tab === 'vessels') setVf({ name: '', registration_no: '', captain_name: '', owner_name: '' })
    if (tab === 'items')   setItf({ code: '', name: '', unit: 'kg', category_id: '', price_estimate: '' })
    setOpen(true)
  }

  const openEdit = (item: FishType | Vessel | Item) => {
    setEditTarget(item)
    if (tab === 'fish' || tab === 'sorted') {
      const f = item as FishType
      setFf({ code: f.code, name: f.name, description: f.description || '', aliases: f.aliases || '',
              is_sorted: f.is_sorted, source_id: f.source_fish_type_id || '', grade: f.grade || '' })
    } else if (tab === 'vessels') {
      const v = item as Vessel
      setVf({ name: v.name, registration_no: v.registration_no || '', captain_name: v.captain_name || '', owner_name: v.owner_name || '' })
    } else {
      const i = item as Item
      setItf({ code: i.code, name: i.name, unit: i.unit, category_id: i.category_id || '',
               price_estimate: i.price_estimate ? String(i.price_estimate) : '' })
    }
    setOpen(true)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    try {
      if (tab === 'fish' || tab === 'sorted') {
        if (!ff.code.trim() || !ff.name.trim()) { toast.error('Kode dan nama wajib diisi'); return }
        if (ff.is_sorted && !ff.source_id) { toast.error('Pilih ikan asal'); return }
        if (editTarget) {
          await fishAPI.updateType(editTarget.id, { name: ff.name.trim(), description: ff.description.trim(), aliases: ff.aliases.trim() })
        } else {
          await fishAPI.createType({
            code: ff.code.trim().toUpperCase(), name: ff.name.trim(),
            description: ff.description.trim(), aliases: ff.aliases.trim(),
            is_sorted: ff.is_sorted,
            source_fish_type_id: ff.is_sorted ? ff.source_id : undefined,
            grade: ff.grade.trim(),
          })
        }
      } else if (tab === 'vessels') {
        if (!vf.name.trim()) { toast.error('Nama kapal wajib diisi'); return }
        if (editTarget) {
          await fishAPI.updateVessel(editTarget.id, vf)
        } else {
          await fishAPI.createVessel(vf)
        }
      } else {
        if (!itf.code.trim() || !itf.name.trim()) { toast.error('Kode dan nama wajib diisi'); return }
        const payload = {
          code: itf.code.trim().toUpperCase(), name: itf.name.trim(), unit: itf.unit,
          category_id: itf.category_id || undefined,
          price_estimate: itf.price_estimate ? parseFloat(itf.price_estimate) : 0,
        }
        if (editTarget) {
          await itemAPI.updateItem(editTarget.id, payload)
        } else {
          await itemAPI.createItem(payload)
        }
      }
      toast.success('Data disimpan')
      setOpen(false)
      await loadAll()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      if (confirmDelete.type === 'fish' || confirmDelete.type === 'sorted') {
        await fishAPI.deleteType(confirmDelete.id)
      } else if (confirmDelete.type === 'items') {
        await itemAPI.deleteItem(confirmDelete.id)
      }
      toast.success('Dihapus')
      setConfirmDelete(null)
      await loadAll()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus')
    } finally {
      setDeleting(false)
    }
  }

  // ── Photo upload ───────────────────────────────────────────────────────────

  const triggerPhoto = (id: string) => { uploadTargetId.current = id; fileInputRef.current?.click() }
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const id = uploadTargetId.current
    if (!file || !id) return
    e.target.value = ''
    setUploadingId(id)
    try {
      await fishAPI.uploadPhoto(id, file)
      toast.success('Foto diunggah')
      await loadAll()
    } catch { toast.error('Gagal mengunggah foto') }
    finally { setUploadingId(null); uploadTargetId.current = null }
  }

  const triggerVesselPhoto = (id: string) => { vesselUploadTargetId.current = id; vesselFileInputRef.current?.click() }
  const handleVesselFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const id = vesselUploadTargetId.current
    if (!file || !id) return
    e.target.value = ''
    setVesselUploadingId(id)
    try {
      await fishAPI.uploadVesselPhoto(id, file)
      toast.success('Foto diunggah')
      await loadAll()
    } catch { toast.error('Gagal mengunggah foto') }
    finally { setVesselUploadingId(null); vesselUploadTargetId.current = null }
  }

  // ── Renders ────────────────────────────────────────────────────────────────

  const currentTabLabel = TABS.find(t => t.key === tab)?.label ?? ''

  const addLabel: Record<Tab, string> = {
    fish: 'Jenis Ikan', sorted: 'Jenis Sortir', vessels: 'Kapal', items: 'Jenis Barang',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Master Data</h2>
          <p className="text-sm text-muted-foreground">Kelola data referensi: jenis ikan, kapal, dan barang</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Tambah {addLabel[tab]}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border bg-muted/40 p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSearch('') }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-white shadow-sm text-foreground dark:bg-card'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <Input
        placeholder={`Cari ${currentTabLabel.toLowerCase()}...`}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* ── TAB: Jenis Ikan ── */}
      {tab === 'fish' && (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Ikan mentah — hasil timbangan dari kapal. Alias digunakan untuk pencocokan OCR dari foto bon.</span>
          </div>
          <FishTypeGrid
            types={filtered(rawFishTypes) as FishType[]}
            loading={loading}
            uploadingId={uploadingId}
            onEdit={openEdit}
            onDelete={f => setConfirmDelete({ id: f.id, label: `${f.code} — ${f.name}`, type: 'fish' })}
            onPhoto={triggerPhoto}
          />
        </>
      )}

      {/* ── TAB: Jenis Sortir ── */}
      {tab === 'sorted' && (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-800">
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Varian ikan setelah disortir berdasarkan ukuran/kelas. Contoh: SSK PC → SSK PC 2UP, SSK PC 3UP. Stok sortir siap jual setelah operasi sortir dicatat.</span>
          </div>
          {loading ? (
            <SortedSkeleton />
          ) : (
            <SortedFishTable
              types={filtered(sortedFishTypes) as FishType[]}
              allTypes={fishTypes}
              onEdit={openEdit}
              onDelete={f => setConfirmDelete({ id: f.id, label: `${f.code} — ${f.name}`, type: 'sorted' })}
            />
          )}
        </>
      )}

      {/* ── TAB: Kapal ── */}
      {tab === 'vessels' && (
        <VesselsTable
          vessels={filtered(vessels) as Vessel[]}
          loading={loading}
          uploadingId={vesselUploadingId}
          onEdit={openEdit}
          onPhoto={triggerVesselPhoto}
        />
      )}

      {/* ── TAB: Jenis Barang ── */}
      {tab === 'items' && (
        <ItemsTable
          items={filtered(items) as Item[]}
          loading={loading}
          onEdit={openEdit}
          onDelete={i => setConfirmDelete({ id: i.id, label: `${i.code} — ${i.name}`, type: 'items' })}
        />
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <input ref={vesselFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleVesselFileChange} />

      {/* ── Save modal ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? 'Edit' : 'Tambah'} {addLabel[tab]}
            </DialogTitle>
          </DialogHeader>

          {(tab === 'fish' || tab === 'sorted') && (
            <div className="space-y-4">
              {tab === 'sorted' && !editTarget && (
                <div className="space-y-1">
                  <Label>Ikan Asal <span className="text-red-500">*</span></Label>
                  <Select value={ff.source_id} onValueChange={v => setFf(p => ({ ...p, source_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih ikan mentah..." /></SelectTrigger>
                    <SelectContent>
                      {rawFishTypes.map(rt => (
                        <SelectItem key={rt.id} value={rt.id}>{rt.code} — {rt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {tab === 'sorted' && !editTarget && (
                <div className="space-y-1">
                  <Label>Grade</Label>
                  <Input value={ff.grade} onChange={e => setFf(p => ({ ...p, grade: e.target.value }))}
                    placeholder="2UP, 3UP, Super, Medium..." />
                </div>
              )}
              <div className="space-y-1">
                <Label>Kode <span className="text-red-500">*</span></Label>
                <Input value={ff.code} onChange={e => setFf(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                  placeholder={tab === 'sorted' ? 'SSK PC 2UP' : 'BH, SSK, TNK...'} disabled={!!editTarget} className="font-mono" />
                {editTarget && <p className="text-xs text-muted-foreground">Kode tidak dapat diubah</p>}
              </div>
              <div className="space-y-1">
                <Label>Nama <span className="text-red-500">*</span></Label>
                <Input value={ff.name} onChange={e => setFf(p => ({ ...p, name: e.target.value }))}
                  placeholder={tab === 'sorted' ? 'SSK PC 2 Up' : 'Baronang Hitam...'} />
              </div>
              <div className="space-y-1">
                <Label>Alias OCR</Label>
                <Input value={ff.aliases} onChange={e => setFf(p => ({ ...p, aliases: e.target.value }))}
                  placeholder="BH., B.H, Bhon" />
                <p className="text-xs text-muted-foreground">Kode alternatif di foto bon, pisahkan koma</p>
              </div>
              <div className="space-y-1">
                <Label>Keterangan</Label>
                <Textarea value={ff.description} onChange={e => setFf(p => ({ ...p, description: e.target.value }))}
                  rows={2} placeholder="Catatan tambahan..." />
              </div>
            </div>
          )}

          {tab === 'vessels' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Nama Kapal <span className="text-red-500">*</span></Label>
                <Input value={vf.name} onChange={e => setVf(p => ({ ...p, name: e.target.value }))} placeholder="KM Harapan Baru" />
              </div>
              <div className="space-y-1">
                <Label>No. Registrasi</Label>
                <Input value={vf.registration_no} onChange={e => setVf(p => ({ ...p, registration_no: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Nama Kapten</Label>
                <Input value={vf.captain_name} onChange={e => setVf(p => ({ ...p, captain_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Pemilik</Label>
                <Input value={vf.owner_name} onChange={e => setVf(p => ({ ...p, owner_name: e.target.value }))} />
              </div>
            </div>
          )}

          {tab === 'items' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Kode <span className="text-red-500">*</span></Label>
                <Input value={itf.code} onChange={e => setItf(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                  disabled={!!editTarget} className="font-mono" placeholder="ES-BAT, BB-SOL..." />
              </div>
              <div className="space-y-1">
                <Label>Nama <span className="text-red-500">*</span></Label>
                <Input value={itf.name} onChange={e => setItf(p => ({ ...p, name: e.target.value }))} placeholder="Es Batu, Solar..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Satuan</Label>
                  <Input value={itf.unit} onChange={e => setItf(p => ({ ...p, unit: e.target.value }))} placeholder="kg, liter, pcs" />
                </div>
                <div className="space-y-1">
                  <Label>Harga Estimasi</Label>
                  <Input type="number" value={itf.price_estimate}
                    onChange={e => setItf(p => ({ ...p, price_estimate: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Kategori</Label>
                <Select value={itf.category_id || 'none'} onValueChange={v => setItf(p => ({ ...p, category_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kategori..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Tanpa kategori —</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div>
              {editTarget && (tab === 'fish' || tab === 'sorted' || tab === 'items') && (
                <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => {
                    setOpen(false)
                    setConfirmDelete({ id: editTarget.id, label: (editTarget as FishType).code || (editTarget as Item).code || '', type: tab })
                  }}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Hapus
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Hapus data?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{confirmDelete?.label}</span> akan dihapus dari master data. Riwayat transaksi tidak akan terhapus.
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function FishTypeGrid({ types, loading, uploadingId, onEdit, onDelete, onPhoto }: {
  types: FishType[]
  loading: boolean
  uploadingId: string | null
  onEdit: (f: FishType) => void
  onDelete: (f: FishType) => void
  onPhoto: (id: string) => void
}) {
  if (loading) return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card animate-pulse">
          <div className="aspect-square bg-muted rounded-t-xl" />
          <div className="p-3 space-y-2"><div className="h-4 w-16 bg-muted rounded" /><div className="h-3 w-24 bg-muted rounded" /></div>
        </div>
      ))}
    </div>
  )
  if (types.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Fish className="h-10 w-10 mb-3 opacity-30" />
      <p>Belum ada jenis ikan</p>
    </div>
  )
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {types.map(ft => (
        <div key={ft.id} className="group relative rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
            {ft.photo_url ? (
              <Image src={ft.photo_url} alt={ft.name} fill className="object-cover" unoptimized />
            ) : (
              <Fish className="h-12 w-12 text-muted-foreground/30" />
            )}
            <button onClick={() => onPhoto(ft.id)} disabled={uploadingId === ft.id}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 group-hover:bg-black/40 transition-colors text-transparent group-hover:text-white text-xs font-medium">
              {uploadingId === ft.id ? <span className="text-white text-xs">Mengunggah...</span> : <><Upload className="h-5 w-5" /><span>Ganti Foto</span></>}
            </button>
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-sm font-bold text-primary">{ft.code}</span>
              <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onEdit(ft)} className="p-1 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                <button onClick={() => onDelete(ft)} className="p-1 rounded hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
              </div>
            </div>
            <p className="text-sm font-medium leading-tight mt-0.5">{ft.name}</p>
            {ft.aliases && (
              <div className="mt-2 flex flex-wrap gap-1">
                {ft.aliases.split(',').map(a => a.trim()).filter(Boolean).map(a => (
                  <span key={a} className="inline-flex items-center gap-0.5 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-800">
                    <Tag className="h-2.5 w-2.5" />{a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function SortedSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg border bg-card animate-pulse" />
      ))}
    </div>
  )
}

function SortedFishTable({ types, allTypes, onEdit, onDelete }: {
  types: FishType[]
  allTypes: FishType[]
  onEdit: (f: FishType) => void
  onDelete: (f: FishType) => void
}) {
  const rawFish = allTypes.filter(f => !f.is_sorted)
  const rawMap = Object.fromEntries(rawFish.map(f => [f.id, f]))

  // Build alias → canonical-id map: for each raw fish, all alias codes map to the
  // row with the most-primary code (prefer the row whose code is the canonical one,
  // i.e. the one that appears in another row's aliases field).
  // Simple rule: if row A has aliases containing code B, then B → A.id.
  const aliasToCanonicalId: Record<string, string> = {}
  for (const f of rawFish) {
    if (f.aliases) {
      for (const alias of f.aliases.split(',').map(a => a.trim()).filter(Boolean)) {
        aliasToCanonicalId[alias.toUpperCase()] = f.id
      }
    }
  }
  // Resolve a source fish type id to its canonical group id
  const resolveCanonical = (srcId: string | undefined): string => {
    if (!srcId) return '__none__'
    const src = rawMap[srcId]
    if (!src) return srcId
    // If this source's code appears as an alias in another row, use that row's id
    return aliasToCanonicalId[src.code.toUpperCase()] ?? srcId
  }

  // Group by canonical source id
  const bySource: Record<string, FishType[]> = {}
  for (const t of types) {
    const key = resolveCanonical(t.source_fish_type_id)
    if (!bySource[key]) bySource[key] = []
    bySource[key].push(t)
  }

  // For the group header, prefer the canonical row
  const resolveHeaderSrc = (key: string): FishType | undefined => {
    const direct = rawMap[key]
    if (direct) return direct
    // key might be a canonical id that isn't itself the source — find by id in rawFish
    return rawFish.find(f => f.id === key)
  }

  if (types.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Layers className="h-10 w-10 mb-3 opacity-30" />
      <p>Belum ada jenis sortir. Tambahkan dari tab ini atau dari halaman Sortir Ikan.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {Object.entries(bySource).map(([srcId, variants]) => {
        const src = resolveHeaderSrc(srcId)
        // Collect all codes in this alias group for the header label
        const groupCodes = src
          ? [src.code, ...(src.aliases ? src.aliases.split(',').map(a => a.trim()).filter(Boolean) : [])]
          : []
        return (
          <div key={srcId} className="rounded-xl border overflow-hidden">
            {/* Source header */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b">
              <Fish className="h-4 w-4 text-cyan-500 shrink-0" />
              <div className="flex items-center gap-1.5">
                {groupCodes.map((c, i) => (
                  <span key={c} className="font-mono font-bold text-sm text-primary">
                    {i > 0 && <span className="text-muted-foreground font-normal mx-0.5">/</span>}
                    {c}
                  </span>
                ))}
              </div>
              <span className="text-sm font-medium">{src?.name ?? 'Sumber tidak diketahui'}</span>
              <span className="text-xs text-muted-foreground ml-auto">{variants.length} varian</span>
            </div>
            {/* Variants */}
            <table className="w-full text-sm">
              <thead className="bg-muted/20">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Kode</th>
                  <th className="text-left px-4 py-2 font-medium">Nama</th>
                  <th className="text-left px-4 py-2 font-medium">Grade</th>
                  <th className="text-left px-4 py-2 font-medium">Alias OCR</th>
                  <th className="text-left px-4 py-2 font-medium">Dibuat</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {variants.map(v => (
                  <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-bold text-primary">{v.code}</td>
                    <td className="px-4 py-2.5 font-medium">{v.name}</td>
                    <td className="px-4 py-2.5">
                      {v.grade ? (
                        <Badge variant="outline" className="text-xs text-cyan-700 border-cyan-200 bg-cyan-50">{v.grade}</Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {v.aliases ? v.aliases.split(',').map(a => a.trim()).filter(Boolean).map(a => (
                          <span key={a} className="inline-flex items-center gap-0.5 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-800">
                            <Tag className="h-2.5 w-2.5" />{a}
                          </span>
                        )) : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(v.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => onEdit(v)} className="p-1 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                        <button onClick={() => onDelete(v)} className="p-1 rounded hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function VesselsTable({ vessels, loading, uploadingId, onEdit, onPhoto }: {
  vessels: Vessel[]
  loading: boolean
  uploadingId: string | null
  onEdit: (v: Vessel) => void
  onPhoto: (id: string) => void
}) {
  if (loading) return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card animate-pulse">
          <div className="aspect-square bg-muted rounded-t-xl" />
          <div className="p-3 space-y-2"><div className="h-4 w-24 bg-muted rounded" /><div className="h-3 w-16 bg-muted rounded" /></div>
        </div>
      ))}
    </div>
  )
  if (vessels.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Ship className="h-10 w-10 mb-3 opacity-30" /><p>Belum ada kapal terdaftar</p>
    </div>
  )
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {vessels.map(v => (
        <div key={v.id} className="group relative rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
            {v.photo_url ? (
              <Image src={v.photo_url} alt={v.name} fill className="object-cover" unoptimized />
            ) : (
              <Ship className="h-12 w-12 text-muted-foreground/30" />
            )}
            <button onClick={() => onPhoto(v.id)} disabled={uploadingId === v.id}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 group-hover:bg-black/40 transition-colors text-transparent group-hover:text-white text-xs font-medium">
              {uploadingId === v.id ? <span className="text-white text-xs">Mengunggah...</span> : <><Upload className="h-5 w-5" /><span>Ganti Foto</span></>}
            </button>
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-bold leading-tight truncate">{v.name}</span>
              <button onClick={() => onEdit(v)} className="shrink-0 p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            {v.captain_name && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">Kapten: {v.captain_name}</p>
            )}
            {v.registration_no && (
              <p className="text-xs font-mono text-muted-foreground truncate">{v.registration_no}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ItemsTable({ items, loading, onEdit, onDelete }: {
  items: Item[]
  loading: boolean
  onEdit: (i: Item) => void
  onDelete: (i: Item) => void
}) {
  if (loading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg border bg-card animate-pulse" />)}</div>
  if (items.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Package className="h-10 w-10 mb-3 opacity-30" /><p>Belum ada jenis barang</p>
    </div>
  )
  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr className="text-xs text-muted-foreground">
            <th className="text-left px-4 py-3 font-medium">Kode</th>
            <th className="text-left px-4 py-3 font-medium">Nama</th>
            <th className="text-left px-4 py-3 font-medium">Kategori</th>
            <th className="text-left px-4 py-3 font-medium">Satuan</th>
            <th className="text-right px-4 py-3 font-medium">Harga Est.</th>
            <th className="w-16" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map(it => (
            <tr key={it.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 font-mono font-bold text-primary">{it.code}</td>
              <td className="px-4 py-3 font-medium">{it.name}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{it.category_name || '—'}</td>
              <td className="px-4 py-3 text-xs">{it.unit}</td>
              <td className="px-4 py-3 text-right text-xs font-mono">
                {it.price_estimate ? it.price_estimate.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }) : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 justify-end">
                  <button onClick={() => onEdit(it)} className="p-1 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  <button onClick={() => onDelete(it)} className="p-1 rounded hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
