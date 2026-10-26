'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Sparkles,
  Download,
  Copy,
  Trash2,
  RefreshCw,
  Search,
  Upload,
  Image as ImageIcon,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  BookOpen,
  Filter,
  Eye,
  SlidersHorizontal,
  LayoutGrid,
  List,
  AlertCircle,
  HelpCircle,
  Share2
} from 'lucide-react'
import { proxyImg } from '@/lib/imageProxy'

// ── Default 20 Categories from Template ──────────────────────────────────────
interface CategoryDef {
  id: number
  label: string
  short: string
  hint: string
}

const DEFAULT_CATEGORIES: CategoryDef[] = [
  // Row 1
  { id: 0, label: 'Quyển sách yêu thích nhất', short: 'Yêu thích nhất', hint: 'Bộ sách/tập truyện bạn tâm đắc nhất' },
  { id: 1, label: 'Cốt truyện hay nhất', short: 'Cốt truyện hay nhất', hint: 'Nội dung và diễn biến lôi cuốn nhất' },
  { id: 2, label: 'Bìa đẹp nhất', short: 'Bìa đẹp nhất', hint: 'Bìa sách có visual ấn tượng nhất' },
  { id: 3, label: 'Bạn sẽ gợi ý cho mọi người đọc', short: 'Gợi ý cho mọi người', hint: 'Bộ truyện ai cũng nên đọc ít nhất một lần' },
  { id: 4, label: 'Dày nhất', short: 'Dày nhất', hint: 'Cuốn sách dày cộm hoặc series dài tập nhất' },

  // Row 2
  { id: 5, label: 'Bạn ghét nhưng mọi người thích', short: 'Ghét nhưng hot', hint: 'Truyện rất nổi nhưng bạn nuốt không trôi' },
  { id: 6, label: 'Bạn thích nhưng mọi người ghét', short: 'Thích dù bị chê', hint: 'Gu lạ của riêng bạn mà ít ai đồng cảm' },
  { id: 7, label: 'Có nhiều kiến thức bổ ích', short: 'Nhiều kiến thức', hint: 'Học được nhiều điều hay và sâu sắc' },
  { id: 8, label: 'Có ảnh hưởng lớn tới bạn', short: 'Ảnh hưởng lớn', hint: 'Thay đổi suy nghĩ hoặc góc nhìn cuộc sống' },
  { id: 9, label: 'Làm bạn khóc', short: 'Làm bạn khóc', hint: 'Lấy đi nhiều nước mắt nhất' },

  // Row 3
  { id: 10, label: 'Nội dung chữa lành', short: 'Nội dung chữa lành', hint: 'Nhẹ nhàng, ấm áp, xoa dịu tâm hồn' },
  { id: 11, label: 'Hay hơn kỳ vọng', short: 'Hay hơn kỳ vọng', hint: 'Tưởng không hay mà hay không tưởng' },
  { id: 12, label: 'Không như kỳ vọng', short: 'Không như kỳ vọng', hint: 'Quá kỳ vọng rồi thấy thất vọng' },
  { id: 13, label: 'Nhân vật chính yêu thích', short: 'Nhân vật chính đỉnh', hint: 'Có nam/nữ chính bạn thích nhất' },
  { id: 14, label: 'Plot twist đỉnh nhất', short: 'Plot twist đỉnh nhất', hint: 'Cú cua gắt làm bạn ngỡ ngàng' },

  // Row 4
  { id: 15, label: 'Đã đọc lại nhiều lần', short: 'Đọc lại nhiều lần', hint: 'Bộ truyện bạn cày đi cày lại không chán' },
  { id: 16, label: 'Tác giả yêu thích', short: 'Tác giả yêu thích', hint: 'Tác phẩm của tác giả ruột của bạn' },
  { id: 17, label: 'Được chuyển thể thành phim', short: 'Đã lên phim / anime', hint: 'Series chuyển thể Anime/Movie ấn tượng' },
  { id: 18, label: 'Đang chờ phát hành', short: 'Đang chờ phát hành', hint: 'Hóng từng ngày tập tiếp theo ra mắt' },
  { id: 19, label: 'Đang đọc dở', short: 'Đang đọc dở', hint: 'Cuốn sách bạn đang đọc tại thời điểm này' },
]

interface SelectedNovel {
  id: string | number
  seriesId?: number | null
  title: string
  publisher?: string
  coverUrl: string
  volumeTitle?: string
}

interface SlotState {
  index: number
  category: CategoryDef
  novel: SelectedNovel | null
}

interface NovelCatalogItem {
  id: string | number
  seriesId: number | null
  title: string
  publisher: string
  volumes: number
  score: number
  coverUrl: string | null
  description?: string | null
}

const TEMPLATE_WIDTH = 767
const TEMPLATE_HEIGHT = 1024

const GRID_COLS = [47, 186, 324, 463, 601]
const GRID_ROWS = [110, 335, 559, 779]
const BOX_WIDTH = 119
const BOX_HEIGHT = 163

function getCanvasImageUrl(url: string | null): string {
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/')) return url
  return `/api/image-proxy?url=${encodeURIComponent(url)}&cors=1`
}

export default function CollageEditorPage() {
  const [slots, setSlots] = useState<SlotState[]>(() => {
    return DEFAULT_CATEGORIES.map((cat, idx) => ({
      index: idx,
      category: cat,
      novel: null,
    }))
  })

  // Catalog of novels from LiDex
  const [catalog, setCatalog] = useState<NovelCatalogItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)

  // Picker Modal State
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null)
  const [modalSearch, setModalSearch] = useState('')
  const [modalPublisher, setModalPublisher] = useState('all')
  const [modalScore, setModalScore] = useState('all')
  const [modalTab, setModalTab] = useState<'catalog' | 'volumes'>('catalog')

  // Volume picker sub-state
  const [inspectSeries, setInspectSeries] = useState<NovelCatalogItem | null>(null)
  const [seriesVolumes, setSeriesVolumes] = useState<any[]>([])
  const [loadingVolumes, setLoadingVolumes] = useState(false)

  // Canvas Generation State
  const [generating, setGenerating] = useState(false)
  const [copiedToast, setCopiedToast] = useState(false)
  const [viewMode, setViewMode] = useState<'poster' | 'list'>('poster')
  const [watermarkText, setWatermarkText] = useState('LiDex • wibubros.id.vn')
  const [showWatermark, setShowWatermark] = useState(true)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Load saved state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lidex_about_you_books_slots')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length === 20) {
          setSlots(parsed)
        }
      }
    } catch {}
  }, [])

  // Save state on change
  useEffect(() => {
    try {
      localStorage.setItem('lidex_about_you_books_slots', JSON.stringify(slots))
    } catch {}
  }, [slots])

  // Load Catalog Data
  useEffect(() => {
    async function loadCatalog() {
      setLoadingCatalog(true)
      try {
        const res = await fetch('/api/dashboard?mode=watchlist&v=2', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        if (data && Array.isArray(data.rankingRows)) {
          const mapped: NovelCatalogItem[] = data.rankingRows
            .filter((r: any) => (Number(r.number_of_volumes) || 0) > 0)
            .map((r: any, idx: number) => ({
              id: r.lidex_series_id || r.series_id || `id-${idx}`,
              seriesId: Number(r.lidex_series_id || r.series_id) || null,
              title: r.series_title || 'Chưa có tên',
              publisher: r.publisher || 'Không xác định',
              volumes: Math.max(0, Number(r.number_of_volumes) || 0),
              score: Number(r.ln_score) || 0,
              coverUrl: r.cover_url || null,
              description: r.description || null,
            }))
          
          // Sort by score descending
          mapped.sort((a, b) => b.score - a.score)
          setCatalog(mapped)
        }
      } catch (err) {
        console.error('Failed to load novels catalog:', err)
      } finally {
        setLoadingCatalog(false)
      }
    }
    loadCatalog()
  }, [])

  // Publishers List for filtering
  const publishers = useMemo(() => {
    const s = new Set<string>()
    catalog.forEach(c => { if (c.publisher) s.add(c.publisher) })
    return Array.from(s).sort()
  }, [catalog])

  // Filtered Catalog
  const filteredCatalog = useMemo(() => {
    const q = modalSearch.trim().toLowerCase()
    return catalog.filter(c => {
      if (modalPublisher !== 'all' && c.publisher !== modalPublisher) return false
      if (modalScore === 'gte_8' && c.score < 8.0) return false
      if (modalScore === 'gte_7' && c.score < 7.0) return false
      if (!q) return true
      return c.title.toLowerCase().includes(q) || c.publisher.toLowerCase().includes(q)
    })
  }, [catalog, modalSearch, modalPublisher, modalScore])

  // Slot management
  const handleAssignNovel = (slotIdx: number, novel: SelectedNovel) => {
    setSlots(prev => {
      const next = [...prev]
      next[slotIdx] = {
        ...next[slotIdx],
        novel,
      }
      return next
    })
    closeModal()
  }

  const handleClearSlot = (slotIdx: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSlots(prev => {
      const next = [...prev]
      next[slotIdx] = {
        ...next[slotIdx],
        novel: null,
      }
      return next
    })
  }

  const handleClearAll = () => {
    if (confirm('Bạn có chắc muốn xóa tất cả 20 ô đã chọn không?')) {
      setSlots(DEFAULT_CATEGORIES.map((cat, idx) => ({
        index: idx,
        category: cat,
        novel: null,
      })))
    }
  }

  // Random fill empty slots
  const handleRandomFill = () => {
    if (!catalog.length) return
    const usedIds = new Set(slots.map(s => s.novel?.id).filter(Boolean))
    const available = catalog.filter(c => !usedIds.has(c.id))
    const pool = available.length >= 20 ? available : catalog

    // Shuffle pool
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    let pIdx = 0

    setSlots(prev => prev.map(slot => {
      if (slot.novel) return slot // keep existing
      const pick = shuffled[pIdx % shuffled.length]
      pIdx++
      return {
        ...slot,
        novel: {
          id: pick.id,
          seriesId: pick.seriesId,
          title: pick.title,
          publisher: pick.publisher,
          coverUrl: pick.coverUrl || '',
        },
      }
    }))
  }

  // Open modal for slot
  const openModal = (idx: number) => {
    setActiveSlotIdx(idx)
    setModalSearch('')
    setModalPublisher('all')
    setModalScore('all')
    setModalTab('catalog')
    setInspectSeries(null)
    setSeriesVolumes([])
  }

  const closeModal = () => {
    setActiveSlotIdx(null)
    setInspectSeries(null)
  }

  // Fetch volume list for a series
  const openVolumePicker = async (series: NovelCatalogItem) => {
    if (!series.seriesId) return
    setInspectSeries(series)
    setModalTab('volumes')
    setLoadingVolumes(true)
    try {
      const res = await fetch(`/api/series-enrichment?id=${series.seriesId}&type=light_novel`)
      if (res.ok) {
        const data = await res.json()
        if (data && Array.isArray(data.volumeReleases)) {
          setSeriesVolumes(data.volumeReleases)
        }
      }
    } catch (e) {
      console.error('Failed to load volumes for picker:', e)
    } finally {
      setLoadingVolumes(false)
    }
  }



  // Count filled slots
  const filledCount = slots.filter(s => s.novel !== null).length

  // ── High-Resolution Canvas Rendering ────────────────────────────────────────
  const renderToCanvas = async (scale = 2): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas')
    canvas.width = TEMPLATE_WIDTH * scale
    canvas.height = TEMPLATE_HEIGHT * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context not available')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // 1. Draw template background
    const bgImg = new Image()
    bgImg.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      bgImg.onload = () => resolve()
      bgImg.onerror = () => reject(new Error('Failed to load template background'))
      bgImg.src = '/templates/about_you_books.png'
    })

    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height)

    // 2. Draw novel covers in each slot
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      if (!slot.novel?.coverUrl) continue

      const r = Math.floor(i / 5)
      const c = i % 5

      const targetX = (GRID_COLS[c] + 1) * scale
      const targetY = (GRID_ROWS[r] + 1) * scale
      const targetW = (BOX_WIDTH - 2) * scale
      const targetH = (BOX_HEIGHT - 2) * scale

      const imgUrl = getCanvasImageUrl(slot.novel.coverUrl)
      if (!imgUrl) continue

      try {
        const coverImg = new Image()
        coverImg.crossOrigin = 'anonymous'
        await new Promise<void>((resolve) => {
          coverImg.onload = () => resolve()
          coverImg.onerror = () => {
            console.warn('Failed to load image for slot', i, imgUrl)
            resolve() // continue without failing entire canvas
          }
          coverImg.src = imgUrl
        })

        if (coverImg.naturalWidth > 0 && coverImg.naturalHeight > 0) {
          ctx.save()
          // Clip to slot rectangle
          ctx.beginPath()
          ctx.rect(targetX, targetY, targetW, targetH)
          ctx.clip()

          // Draw image with object-fit: cover
          const imgAspect = coverImg.naturalWidth / coverImg.naturalHeight
          const slotAspect = targetW / targetH
          let sWidth = coverImg.naturalWidth
          let sHeight = coverImg.naturalHeight
          let sx = 0
          let sy = 0

          if (imgAspect > slotAspect) {
            // Image is wider than slot: crop left/right
            sWidth = coverImg.naturalHeight * slotAspect
            sx = (coverImg.naturalWidth - sWidth) / 2
          } else {
            // Image is taller than slot: crop top/bottom
            sHeight = coverImg.naturalWidth / slotAspect
            sy = (coverImg.naturalHeight - sHeight) / 2
          }

          ctx.drawImage(coverImg, sx, sy, sWidth, sHeight, targetX, targetY, targetW, targetH)
          ctx.restore()

          // Stroke crisp border around the cover
          ctx.strokeStyle = '#9e927a'
          ctx.lineWidth = 2 * scale
          ctx.strokeRect(targetX - 1, targetY - 1, targetW + 2, targetH + 2)
        }
      } catch (e) {
        console.warn('Error rendering slot image:', e)
      }
    }

    // 3. Draw Watermark if enabled
    if (showWatermark && watermarkText.trim()) {
      ctx.save()
      ctx.fillStyle = 'rgba(142, 130, 108, 0.92)'
      ctx.font = `600 ${11 * scale}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      const wmY = (TEMPLATE_HEIGHT - 12) * scale
      const wmX = (TEMPLATE_WIDTH / 2) * scale
      
      // Draw watermark text centered near bottom
      ctx.fillText(watermarkText.trim(), wmX, wmY)
      ctx.restore()
    }

    return canvas
  }

  // ── Download PNG Action ─────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const canvas = await renderToCanvas(2) // 2x high resolution (1534 x 2048)
      canvas.toBlob((blob) => {
        if (!blob) {
          alert('Không thể tạo file ảnh')
          setGenerating(false)
          return
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `about-you-books-lidex-${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setGenerating(false)
      }, 'image/png')
    } catch (err: any) {
      console.error('Download failed:', err)
      alert('Đã xảy ra lỗi khi tạo ảnh: ' + (err?.message || 'Lỗi không xác định'))
      setGenerating(false)
    }
  }

  // ── Copy Image to Clipboard Action ──────────────────────────────────────────
  const handleCopyImage = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const canvas = await renderToCanvas(2)
      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert('Không thể xuất ảnh')
          setGenerating(false)
          return
        }
        try {
          if (navigator.clipboard && (window as any).ClipboardItem) {
            await navigator.clipboard.write([
              new (window as any).ClipboardItem({ 'image/png': blob })
            ])
            setCopiedToast(true)
            setTimeout(() => setCopiedToast(false), 3000)
          } else {
            alert('Trình duyệt của bạn không hỗ trợ sao chép ảnh trực tiếp vào clipboard. Vui lòng bấm "Tải ảnh PNG".')
          }
        } catch (clipErr) {
          console.error('Clipboard copy error:', clipErr)
          alert('Không thể sao chép vào clipboard. Bạn có thể bấm "Tải ảnh PNG" để lưu file ảnh.')
        } finally {
          setGenerating(false)
        }
      }, 'image/png')
    } catch (e: any) {
      console.error(e)
      alert('Đã xảy ra lỗi: ' + (e?.message || 'Lỗi kết xuất ảnh'))
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen relative pb-16 text-slate-100" style={{ background: 'var(--background)' }}>
      {/* Background ambient lighting */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 left-1/3 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(217, 119, 6, 0.08)' }} />
        <div className="absolute top-96 right-1/4 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(124, 106, 245, 0.08)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-6">

        {/* ── Page Header & Controls ───────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📚</span>
              <h1 className="text-2xl sm:text-3xl font-black gradient-text">
                Tạo Bảng Sách 20 Ô (About You: Books)
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              Chọn Light Novel yêu thích cho từng chủ đề để tạo poster cá nhân ấn tượng theo phong cách 9koma, sẵn sàng chia sẻ lên mạng xã hội.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleRandomFill}
              disabled={loadingCatalog || catalog.length === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800/90 hover:bg-slate-700 border border-slate-700 flex items-center gap-1.5 transition-all text-amber-300"
              title="Tự động điền ngẫu nhiên các ô còn trống từ kho Light Novel"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Điền ngẫu nhiên</span>
            </button>

            <button
              onClick={handleClearAll}
              disabled={filledCount === 0}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800/90 hover:bg-rose-950/60 hover:text-rose-400 hover:border-rose-800 border border-slate-700 flex items-center gap-1.5 transition-all text-slate-400 disabled:opacity-40"
              title="Xóa tất cả các ô đã chọn"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Xóa hết</span>
            </button>

            <button
              onClick={handleCopyImage}
              disabled={generating}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-1.5 transition-all text-slate-200"
              title="Sao chép ảnh vào clipboard để dán trực tiếp (Ctrl+V)"
            >
              <Copy className="w-4 h-4 text-sky-400" />
              <span>{copiedToast ? 'Đã sao chép! ✓' : 'Sao chép ảnh'}</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={generating}
              className="px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 flex items-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              <Download className={`w-4 h-4 ${generating ? 'animate-bounce' : ''}`} />
              <span>{generating ? 'Đang xuất ảnh...' : 'Tải ảnh PNG'}</span>
            </button>
          </div>
        </div>

        {/* ── Status Bar & View Mode Switcher ──────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-slate-400">Tiến độ:</span>
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-xl border border-slate-800">
              <span className="font-black text-amber-400 text-sm">{filledCount} / 20</span>
              <span className="text-slate-500 text-[11px]">ô đã điền</span>
            </div>
            {filledCount === 20 && (
              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold text-[10px] border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-3 h-3" /> Hoàn thành 20/20
              </span>
            )}
          </div>

          {/* Watermark customizer pill */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-xl border border-slate-800">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 font-semibold select-none">
                <input
                  type="checkbox"
                  checked={showWatermark}
                  onChange={e => setShowWatermark(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                />
                <span>Watermark:</span>
              </label>
              {showWatermark && (
                <input
                  type="text"
                  value={watermarkText}
                  onChange={e => setWatermarkText(e.target.value)}
                  placeholder="Watermark ảnh..."
                  className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded-md border border-slate-700 text-[11px] outline-none w-36"
                />
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center p-1 rounded-xl border border-slate-800 bg-slate-900">
              <button
                type="button"
                onClick={() => setViewMode('poster')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all font-bold ${
                  viewMode === 'poster' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Bảng poster</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all font-bold ${
                  viewMode === 'list' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Danh sách 20 ô</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── POSTER VIEW: INTERACTIVE 768x1024 GRID ────────────────────────── */}
        {viewMode === 'poster' ? (
          <div className="flex justify-center">
            <div
              className="relative w-full max-w-[767px] shadow-2xl rounded-2xl overflow-hidden border-2 border-amber-900/40 select-none"
              style={{
                aspectRatio: '767 / 1024',
                backgroundColor: '#fef1e1',
              }}
            >
              {/* Background Template Graphic */}
              <img
                src="/templates/about_you_books.png"
                alt="About you books template"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />

              {/* 20 Interactive Slot Overlays */}
              {slots.map((slot) => {
                const r = Math.floor(slot.index / 5)
                const c = slot.index % 5

                const leftPct = (GRID_COLS[c] / TEMPLATE_WIDTH) * 100
                const topPct = (GRID_ROWS[r] / TEMPLATE_HEIGHT) * 100
                const widthPct = (BOX_WIDTH / TEMPLATE_WIDTH) * 100
                const heightPct = (BOX_HEIGHT / TEMPLATE_HEIGHT) * 100

                const isFilled = slot.novel !== null

                return (
                  <div
                    key={slot.index}
                    onClick={() => openModal(slot.index)}
                    className="absolute cursor-pointer transition-all duration-150 group"
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${widthPct}%`,
                      height: `${heightPct}%`,
                    }}
                    title={`${slot.category.label}${slot.novel ? `: ${slot.novel.title}` : ' (Bấm để chọn truyện)'}`}
                  >
                    {isFilled ? (
                      /* Filled State */
                      <div className="relative w-full h-full overflow-hidden rounded-[2px] shadow-sm">
                        <img
                          src={proxyImg(slot.novel!.coverUrl) || slot.novel!.coverUrl}
                          alt={slot.novel!.title}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        {/* Hover Overlay with Action Buttons */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1 text-center">
                          <span className="text-[10px] font-black text-white leading-tight line-clamp-2 px-1">
                            {slot.novel!.title}
                          </span>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[9px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded shadow">
                              Đổi
                            </span>
                            <button
                              onClick={(e) => handleClearSlot(slot.index, e)}
                              className="text-[9px] font-bold bg-rose-600 hover:bg-rose-500 text-white px-2 py-0.5 rounded shadow"
                              title="Xóa ô này"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Empty State: Subtle click target inside the box */
                      <div className="w-full h-full flex flex-col items-center justify-center transition-all bg-black/0 group-hover:bg-amber-900/15 rounded-[2px]">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-[#9e927a]/60 bg-[#fef1e1]/80 flex items-center justify-center shadow-sm opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all">
                          <span className="text-base sm:text-lg font-black text-[#5f562b] leading-none">+</span>
                        </div>
                        <span className="text-[8px] sm:text-[9px] font-bold text-[#7d7047] opacity-0 group-hover:opacity-100 transition-opacity mt-1 text-center px-1">
                          Chọn truyện
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Watermark Preview at bottom */}
              {showWatermark && watermarkText.trim() && (
                <div
                  className="absolute bottom-1 inset-x-0 text-center pointer-events-none text-[10px] font-semibold text-[#8c8168]/80 select-none"
                  style={{ bottom: '0.9%' }}
                >
                  {watermarkText.trim()}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── LIST VIEW: ACCESSIBLE CARD LIST ────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {slots.map((slot) => {
              const isFilled = slot.novel !== null
              return (
                <div
                  key={slot.index}
                  className="p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3 shadow-sm bg-slate-900/90 border-slate-800 hover:border-slate-700"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-400 font-black text-[11px] uppercase tracking-wider">
                        Ô #{slot.index + 1}
                      </span>
                      {isFilled && (
                        <span className="text-emerald-400 text-[10px] font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Đã chọn ✓
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-black text-slate-100 leading-snug line-clamp-2">
                      {slot.category.label}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {slot.category.hint}
                    </p>
                  </div>

                  {/* Slot Visual Box */}
                  <div
                    onClick={() => openModal(slot.index)}
                    className="relative aspect-[2/3] w-full max-w-[130px] mx-auto rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950/70 cursor-pointer group flex items-center justify-center transition-all hover:border-amber-500"
                  >
                    {isFilled ? (
                      <>
                        <img
                          src={proxyImg(slot.novel!.coverUrl) || slot.novel!.coverUrl}
                          alt={slot.novel!.title}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center">
                          <span className="text-xs font-black text-white line-clamp-2">
                            {slot.novel!.title}
                          </span>
                          <span className="mt-1 text-[10px] font-bold text-amber-400 underline">
                            Bấm để đổi
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-2 text-center text-slate-500 group-hover:text-amber-400 transition-colors">
                        <BookOpen className="w-8 h-8 mb-1.5 opacity-60" />
                        <span className="text-[10px] font-bold">Bấm để chọn</span>
                      </div>
                    )}
                  </div>

                  {/* Novel Title / Controls */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
                    {isFilled ? (
                      <>
                        <span className="text-slate-300 font-bold truncate flex-1 text-[11px]">
                          {slot.novel!.title}
                        </span>
                        <button
                          onClick={(e) => handleClearSlot(slot.index, e)}
                          className="text-rose-400 hover:text-rose-300 text-[11px] font-bold px-1.5 py-0.5 rounded hover:bg-rose-950/40"
                        >
                          Xóa
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => openModal(slot.index)}
                        className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs transition-colors text-center"
                      >
                        + Chọn truyện
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── NOVEL PICKER MODAL (9koma Inspiration) ───────────────────────── */}
        {activeSlotIdx !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div
              className="relative max-w-2xl w-full rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-700 bg-slate-900 text-slate-100 max-h-[90vh] flex flex-col space-y-4"
              style={{ background: 'var(--card-bg)' }}
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                      Ô #{activeSlotIdx + 1}
                    </span>
                    <h2 className="text-lg sm:text-xl font-black text-slate-100">
                      {slots[activeSlotIdx].category.label}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {slots[activeSlotIdx].category.hint}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs / Subtitle */}
              {inspectSeries ? (
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <button
                    onClick={() => {
                      setInspectSeries(null)
                      setModalTab('catalog')
                    }}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    ← Quay lại tìm kiếm Light Novel
                  </button>
                  <span className="text-xs font-bold text-slate-300 truncate max-w-[280px]">
                    Đang xem: {inspectSeries.title}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <BookOpen className="w-4 h-4" />
                    <span>Chọn từ cơ sở dữ liệu Light Novel LiDex ({catalog.length} series)</span>
                  </div>
                </div>
              )}

              {/* ── TAB 1: LIDEX CATALOG SEARCH ───────────────────────────── */}
              {modalTab === 'catalog' && (
                <div className="flex-1 flex flex-col min-h-0 space-y-3">
                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={modalSearch}
                        onChange={e => setModalSearch(e.target.value)}
                        placeholder="Tìm tên Light Novel, nhà phát hành..."
                        autoFocus
                        className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-amber-500/40"
                      />
                      {modalSearch && (
                        <button
                          onClick={() => setModalSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-700 text-slate-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Publisher Dropdown */}
                    <select
                      value={modalPublisher}
                      onChange={e => setModalPublisher(e.target.value)}
                      className="bg-slate-800 text-slate-200 text-xs px-2.5 py-2 rounded-xl border border-slate-700 font-bold outline-none cursor-pointer"
                    >
                      <option value="all">Tất cả NPH ({catalog.length})</option>
                      {publishers.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>

                    {/* Score Dropdown */}
                    <select
                      value={modalScore}
                      onChange={e => setModalScore(e.target.value)}
                      className="bg-slate-800 text-slate-200 text-xs px-2.5 py-2 rounded-xl border border-slate-700 font-bold outline-none cursor-pointer"
                    >
                      <option value="all">Tất cả điểm</option>
                      <option value="gte_8">★ ≥ 8.0</option>
                      <option value="gte_7">★ ≥ 7.0</option>
                    </select>
                  </div>

                  {/* Results Scroll Area */}
                  <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-[280px] max-h-[420px]">
                    {loadingCatalog ? (
                      <div className="h-48 flex items-center justify-center text-xs text-slate-400 gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                        <span>Đang tải kho dữ liệu Light Novel...</span>
                      </div>
                    ) : filteredCatalog.length === 0 ? (
                      <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                        <BookOpen className="w-8 h-8 opacity-40 mb-1" />
                        <span className="font-bold">Không tìm thấy series phù hợp</span>
                        <span className="text-[11px] text-slate-500">Thử xóa từ khóa hoặc thay đổi bộ lọc nhà phát hành</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {filteredCatalog.map(novel => {
                          const hasCover = Boolean(novel.coverUrl)
                          return (
                            <div
                              key={novel.id}
                              className="group p-2 rounded-xl border border-slate-800 hover:border-amber-500/80 bg-slate-950/60 hover:bg-slate-900 transition-all flex flex-col justify-between gap-2 shadow-sm relative cursor-pointer"
                              onClick={() => {
                                handleAssignNovel(activeSlotIdx, {
                                  id: novel.id,
                                  seriesId: novel.seriesId,
                                  title: novel.title,
                                  publisher: novel.publisher,
                                  coverUrl: novel.coverUrl || '',
                                })
                              }}
                            >
                              {/* Thumbnail */}
                              <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-slate-800 border border-slate-700/60 flex items-center justify-center">
                                {hasCover ? (
                                  <img
                                    src={proxyImg(novel.coverUrl) || novel.coverUrl || ''}
                                    alt={novel.title}
                                    loading="lazy"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                ) : (
                                  <BookOpen className="w-8 h-8 text-slate-500 opacity-60" />
                                )}
                                <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-black text-amber-300 bg-black/80 backdrop-blur-sm">
                                  ★ {novel.score.toFixed(1)}
                                </div>
                              </div>

                              {/* Title & Publisher */}
                              <div className="space-y-0.5 min-w-0">
                                <h4 className="text-xs font-bold text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
                                  {novel.title}
                                </h4>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {novel.publisher}
                                </p>
                              </div>

                              {/* Buttons */}
                              <div className="flex items-center gap-1 pt-1">
                                <button
                                  type="button"
                                  className="flex-1 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] transition-colors"
                                >
                                  Chọn
                                </button>
                                {novel.seriesId && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openVolumePicker(novel)
                                    }}
                                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700"
                                    title="Xem các tập khác của bộ này"
                                  >
                                    Tập...
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB 3: SPECIFIC VOLUME PICKER ─────────────────────────── */}
              {modalTab === 'volumes' && inspectSeries && (
                <div className="flex-1 flex flex-col min-h-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-300 font-bold">
                      Chọn ảnh bìa tập cụ thể cho: <strong className="text-amber-400">{inspectSeries.title}</strong>
                    </p>
                    <button
                      onClick={() => setModalTab('catalog')}
                      className="text-xs text-slate-400 hover:text-slate-200 underline"
                    >
                      Quay lại tìm kiếm
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 min-h-[280px] max-h-[420px]">
                    {loadingVolumes ? (
                      <div className="h-48 flex items-center justify-center text-xs text-slate-400 gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                        <span>Đang tải danh sách các tập...</span>
                      </div>
                    ) : seriesVolumes.length === 0 ? (
                      <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-xs">
                        <p>Chưa có dữ liệu từng tập riêng.</p>
                        <button
                          onClick={() => {
                            handleAssignNovel(activeSlotIdx, {
                              id: inspectSeries.id,
                              seriesId: inspectSeries.seriesId,
                              title: inspectSeries.title,
                              publisher: inspectSeries.publisher,
                              coverUrl: inspectSeries.coverUrl || '',
                            })
                          }}
                          className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                        >
                          Dùng bìa chính mặc định
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {seriesVolumes.map((vol, vIdx) => {
                          const volNum = vol.volume_number || (vIdx + 1)
                          const volCover = vol.image_url || inspectSeries.coverUrl
                          return (
                            <div
                              key={vol.id || vIdx}
                              onClick={() => {
                                handleAssignNovel(activeSlotIdx, {
                                  id: `${inspectSeries.id}-v${volNum}`,
                                  seriesId: inspectSeries.seriesId,
                                  title: `${inspectSeries.title} (Tập ${volNum})`,
                                  publisher: inspectSeries.publisher,
                                  coverUrl: volCover || '',
                                  volumeTitle: `Tập ${volNum}`,
                                })
                              }}
                              className="group p-2 rounded-xl border border-slate-800 hover:border-amber-500/80 bg-slate-950/60 hover:bg-slate-900 transition-all flex flex-col justify-between gap-1.5 shadow-sm cursor-pointer"
                            >
                              <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-slate-800 border border-slate-700/60 relative">
                                <img
                                  src={proxyImg(volCover) || volCover || ''}
                                  alt={`Tập ${volNum}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-black text-white bg-black/80">
                                  Tập {volNum}
                                </div>
                              </div>
                              <div className="text-center pt-1">
                                <span className="text-[11px] font-bold text-slate-200 group-hover:text-amber-400">
                                  Tập {volNum}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="w-full py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-[11px]"
                              >
                                Chọn tập này
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  )
}
