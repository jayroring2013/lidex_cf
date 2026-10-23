'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Play, Pause, RotateCcw, ZoomIn, ZoomOut,
  X, ExternalLink, Layers, Sparkles
} from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'

interface NovelNetworkItem {
  id: number
  series_title: string
  lidex_series_id: number | null
  publisher: string
  publisher_logo: string | null
  number_of_volumes: number | null
  original_volumes: number | null
  original_status: string | null
  evalution: string | null
  evaluation_basis: string | null
  ln_score: number | null
  trang_thai: string
  average_price: number | null
  max_release_at: string | null
  drop_percent: number | null
  months_since_last_release: number | null
  cover_url: string | null
  title_vi: string | null
  title_native: string | null
  slug: string | null
  genres: string[]
}

interface NodeData {
  id: string
  label: string
  type: 'publisher' | 'series'
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  count?: number
  raw?: NovelNetworkItem
  __matchesQuery?: boolean
}

interface LinkData {
  source: NodeData
  target: NodeData
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

function generateMockData(): NovelNetworkItem[] {
  const PUBLISHERS = ['IPM', 'Kim Đồng', 'Hikari', 'NXB Trẻ', 'Amak', 'Đông A', 'Skybooks', 'Comicola', 'Waka', 'Kadokawa VN', 'TVM Comics', 'Việt Bút', 'Sói Books', 'Bách Việt', 'NetLight']
  const TITLES_A = ['Haruka', 'Yuki', 'Sora', 'Rei', 'Kaguya', 'Akane', 'Tsuki', 'Hikari', 'Mirai', 'Ren', 'Shinji', 'Kanade', 'Yui', 'Kohaku', 'Nagi', 'Homura', 'Aoi', 'Riku', 'Sakura', 'Toko']
  const TITLES_B = ['no Eiyuutan', 'to Isekai Bouken', 'Gakuen no Nazo', 'wa Sekai wo Sukuu', 'Kishidan Monogatari', 'no Bishoujo Tantei', 'Maou Kaitai Roku', 'to Kenja no Deshi', 'Ryuu no Kioku', 'Kuni no Oujo', 'Nikki', 'Chronicle', 'Wars', 'Requiem', 'Symphony', 'Reincarnation Log', 'Academy Days', 'Labyrinth', 'Contract', 'Alchemist']
  
  const items: NovelNetworkItem[] = []
  for (let i = 1; i <= 300; i++) {
    const pub = PUBLISHERS[(i - 1) % PUBLISHERS.length]
    const title = `${TITLES_A[i % TITLES_A.length]} ${TITLES_B[(i * 3) % TITLES_B.length]}`
    items.push({
      id: i,
      series_title: title,
      lidex_series_id: i,
      publisher: pub,
      publisher_logo: null,
      number_of_volumes: (i % 25) + 1,
      original_volumes: (i % 30) + 1,
      original_status: i % 4 === 0 ? 'Hoàn thành' : 'Đang tiến hành',
      evalution: null,
      evaluation_basis: null,
      ln_score: Math.round((7.0 + (i % 30) * 0.09) * 10) / 10,
      trang_thai: i % 4 === 0 ? 'Hoàn thành' : 'Đang tiến hành',
      average_price: 95000,
      max_release_at: '2026-05-01',
      drop_percent: 0,
      months_since_last_release: 2,
      cover_url: `https://picsum.photos/seed/${encodeURIComponent(title + i)}/300/450`,
      title_vi: title,
      title_native: null,
      slug: `novel-${i}`,
      genres: ['Fantasy', 'Adventure']
    })
  }
  return items
}

export default function NovelNetworkClient({ initialData }: { initialData: NovelNetworkItem[] }) {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  // Standardize data source (fallback to mock if empty)
  const data = useMemo(() => {
    return (initialData && initialData.length > 0) ? initialData : generateMockData()
  }, [initialData])

  // Extract unique publishers & assign HSL colors
  const publisherColors = useMemo(() => {
    const pubMap = new Map<string, number>()
    data.forEach(item => {
      const pub = item.publisher || 'Khác'
      if (!pubMap.has(pub)) {
        pubMap.set(pub, pubMap.size)
      }
    })
    const colorMap: Record<string, string> = {}
    const pubs = Array.from(pubMap.keys())
    pubs.forEach((pub, idx) => {
      colorMap[pub] = hslToHex((idx * 137.508) % 360, 72, 56)
    })
    return colorMap
  }, [data])

  // Filters State
  const [statusFilter, setStatusFilter] = useState<'ongoing' | 'completed' | 'all'>('ongoing')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [activePublishers, setActivePublishers] = useState<Set<string>>(() => {
    return new Set(data.map(i => i.publisher || 'Khác'))
  })

  // Physics & Visual State
  const [isPhysicsActive, setIsPhysicsActive] = useState<boolean>(false)
  const [clusterMode, setClusterMode] = useState<boolean>(true)
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null)
  const [hoveredNode, setHoveredNode] = useState<NodeData | null>(null)
  const [zoomPercent, setZoomPercent] = useState<number>(42)

  // Refs for Canvas, Camera, Graph State
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef({ x: 0, y: 0, k: 0.42 })
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const camStartRef = useRef({ x: 0, y: 0 })
  const isPhysicsActiveRef = useRef(false)
  const clusterModeRef = useRef(true)
  const stableFramesRef = useRef(0)

  const nodesRef = useRef<NodeData[]>([])
  const linksRef = useRef<LinkData[]>([])
  const imageCacheRef = useRef<Map<string, { img: HTMLImageElement; loaded: boolean }>>(new Map())
  const topPublisherIdRef = useRef<string | null>(null)

  // Image loader helper
  const getImage = useCallback((url: string) => {
    let entry = imageCacheRef.current.get(url)
    if (!entry) {
      const img = new Image()
      entry = { img, loaded: false }
      img.onload = () => { if (entry) entry.loaded = true }
      img.crossOrigin = 'anonymous'
      img.src = url
      imageCacheRef.current.set(url, entry)
    }
    return entry
  }, [])

  // Sync state to refs for animation loops
  useEffect(() => {
    isPhysicsActiveRef.current = isPhysicsActive
  }, [isPhysicsActive])

  useEffect(() => {
    clusterModeRef.current = clusterMode
  }, [clusterMode])

  // Filtered dataset
  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return data.filter(item => {
      const s = (item.trang_thai || '').toLowerCase()
      if (statusFilter === 'ongoing') {
        if (!s.includes('tiến hành') && !s.includes('đang ra') && !s.includes('ongoing')) return false
      } else if (statusFilter === 'completed') {
        if (!s.includes('hoàn thành') && !s.includes('completed')) return false
      }

      const pub = item.publisher || 'Khác'
      if (!activePublishers.has(pub)) return false

      if (q) {
        const titleMatch = (item.series_title || '').toLowerCase().includes(q)
        const titleViMatch = (item.title_vi || '').toLowerCase().includes(q)
        const pubMatch = pub.toLowerCase().includes(q)
        if (!titleMatch && !titleViMatch && !pubMatch) return false
      }
      return true
    })
  }, [data, statusFilter, activePublishers, searchQuery])

  // Publisher Market Stats for Left Legend
  const publisherStats = useMemo(() => {
    const countMap: Record<string, number> = {}
    data.forEach(item => {
      const p = item.publisher || 'Khác'
      countMap[p] = (countMap[p] || 0) + 1
    })

    const list = Object.entries(countMap)
      .map(([name, count]) => ({
        name,
        count,
        color: publisherColors[name] || '#a855f7'
      }))
      .sort((a, b) => b.count - a.count)

    const maxCount = Math.max(1, ...list.map(p => p.count))
    const totalCount = data.length

    return {
      list,
      maxCount,
      totalCount,
      topPublisher: list[0] || null
    }
  }, [data, publisherColors])

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const ongoingCount = filteredData.length
    const pubSet = new Set(filteredData.map(i => i.publisher || 'Khác'))
    const totalVols = filteredData.reduce((acc, i) => acc + (i.number_of_volumes || 0), 0)
    const validScores = filteredData.filter(i => typeof i.ln_score === 'number' && i.ln_score! > 0)
    const avgScore = validScores.length > 0
      ? (validScores.reduce((acc, i) => acc + (i.ln_score || 0), 0) / validScores.length).toFixed(1)
      : '0'

    return {
      ongoingCount,
      pubCount: pubSet.size,
      totalVols,
      avgScore
    }
  }, [filteredData])

  // Graph Physics Simulation step
  const physicsTick = useCallback(() => {
    const nodes = nodesRef.current
    const links = linksRef.current
    if (nodes.length === 0) return 0

    const CELL_SIZE = 140
    const grid = new Map<string, NodeData[]>()
    nodes.forEach(n => {
      const key = `${Math.floor(n.x / CELL_SIZE)}:${Math.floor(n.y / CELL_SIZE)}`
      if (!grid.has(key)) grid.set(key, [])
      grid.get(key)!.push(n)
    })

    let totalMotion = 0

    // Repulsion between close neighbors
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      const cx = Math.floor(a.x / CELL_SIZE)
      const cy = Math.floor(a.y / CELL_SIZE)

      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const bucket = grid.get(`${gx}:${gy}`)
          if (!bucket) continue
          for (let k = 0; k < bucket.length; k++) {
            const b = bucket[k]
            if (b === a) continue
            const dx = a.x - b.x || 0.01
            const dy = a.y - b.y || 0.01
            const distSq = dx * dx + dy * dy
            if (distSq > CELL_SIZE * CELL_SIZE * 2.2) continue
            const dist = Math.sqrt(distSq)
            const force = (150 * 150) / (distSq + 80)
            const fx = (dx / dist) * force * 0.018
            const fy = (dy / dist) * force * 0.018
            a.vx += fx
            a.vy += fy
          }
        }
      }
    }

    // Hub-Hub separation so big publisher clusters never overlap
    const hubs = nodes.filter(n => n.type === 'publisher')
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const a = hubs[i], b = hubs[j]
        const dx = b.x - a.x || 0.01
        const dy = b.y - a.y || 0.01
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = a.radius + b.radius + 170
        if (dist < minDist) {
          const push = (minDist - dist) * 0.05
          const fx = (dx / dist) * push
          const fy = (dy / dist) * push
          a.vx -= fx; a.vy -= fy
          b.vx += fx; b.vy += fy
        }
      }
    }

    // Spring links (series <-> publisher hub)
    links.forEach(l => {
      const dx = l.target.x - l.source.x || 0.01
      const dy = l.target.y - l.source.y || 0.01
      const dist = Math.sqrt(dx * dx + dy * dy)
      const restLen = clusterModeRef.current ? 130 : 220
      const force = (dist - restLen) * 0.045
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      l.source.vx += fx
      l.source.vy += fy
      l.target.vx -= fx
      l.target.vy -= fy
    })

    // Damping and Position update
    nodes.forEach(node => {
      if (node.type === 'publisher') {
        node.vx -= node.x * 0.0025
        node.vy -= node.y * 0.0025
      } else {
        node.vx -= node.x * 0.0002
        node.vy -= node.y * 0.0002
      }
      node.vx *= 0.84
      node.vy *= 0.84
      node.x += node.vx
      node.y += node.vy
      totalMotion += Math.abs(node.vx) + Math.abs(node.vy)
    })

    return totalMotion / nodes.length
  }, [])

  // Presettle initial layout
  const presettleLayout = useCallback((iterations: number) => {
    for (let i = 0; i < iterations; i++) {
      physicsTick()
    }
  }, [physicsTick])

  // Initialize or update graph nodes
  useEffect(() => {
    const prevPositions = new Map<string, { x: number; y: number }>()
    nodesRef.current.forEach(n => prevPositions.set(n.id, { x: n.x, y: n.y }))

    const newNodes: NodeData[] = []
    const newLinks: LinkData[] = []
    const nodeMap = new Map<string, NodeData>()

    const countByPub: Record<string, number> = {}
    filteredData.forEach(i => {
      const pub = i.publisher || 'Khác'
      countByPub[pub] = (countByPub[pub] || 0) + 1
    })

    const pubsInUse = Array.from(new Set(filteredData.map(i => i.publisher || 'Khác')))
      .sort((a, b) => (countByPub[b] || 0) - (countByPub[a] || 0))

    const maxPubCount = Math.max(1, ...pubsInUse.map(p => countByPub[p] || 0))
    const ringR = Math.max(340, pubsInUse.length * 46)

    // Create Publisher Hub Nodes
    pubsInUse.forEach((pub, idx) => {
      const angle = (idx / pubsInUse.length) * Math.PI * 2
      const prev = prevPositions.get('pub_' + pub)
      const count = countByPub[pub] || 0
      const hubRadius = 20 + Math.sqrt(count / maxPubCount) * 38

      const node: NodeData = {
        id: 'pub_' + pub,
        label: pub,
        type: 'publisher',
        x: prev ? prev.x : Math.cos(angle) * ringR,
        y: prev ? prev.y : Math.sin(angle) * ringR,
        vx: 0,
        vy: 0,
        radius: hubRadius,
        count,
        color: publisherColors[pub] || '#8b5cf6'
      }
      newNodes.push(node)
      nodeMap.set(node.id, node)
    })

    // Create Series Nodes
    filteredData.forEach(item => {
      const pub = item.publisher || 'Khác'
      const pubNode = nodeMap.get('pub_' + pub)
      const prev = prevPositions.get('series_' + item.id)

      let initX = 0
      let initY = 0
      if (prev) {
        initX = prev.x
        initY = prev.y
      } else {
        const baseDist = 90 + Math.random() * 140
        const angle = Math.random() * Math.PI * 2
        initX = pubNode ? pubNode.x + Math.cos(angle) * baseDist : (Math.random() - 0.5) * 800
        initY = pubNode ? pubNode.y + Math.sin(angle) * baseDist : (Math.random() - 0.5) * 800
      }

      const score = item.ln_score || 7.0
      const seriesNode: NodeData = {
        id: 'series_' + item.id,
        label: item.series_title || item.title_vi || 'Untitled',
        type: 'series',
        raw: item,
        x: initX,
        y: initY,
        vx: 0,
        vy: 0,
        radius: Math.max(8, Math.min(19, 4 + Math.pow(Math.max(0, score - 6.5), 1.5) * 3.2)),
        color: publisherColors[pub] || '#8b5cf6'
      }
      newNodes.push(seriesNode)
      nodeMap.set(seriesNode.id, seriesNode)

      if (pubNode) {
        newLinks.push({ source: seriesNode, target: pubNode })
      }
    })

    topPublisherIdRef.current = pubsInUse.length ? 'pub_' + pubsInUse[0] : null
    nodesRef.current = newNodes
    linksRef.current = newLinks

    presettleLayout(220)
    setIsPhysicsActive(false)
    stableFramesRef.current = 0
  }, [filteredData, publisherColors, presettleLayout])

  // Canvas drawing & main animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    const minimapCanvas = minimapCanvasRef.current
    if (!canvas || !minimapCanvas) return

    const ctx = canvas.getContext('2d')
    const mctx = minimapCanvas.getContext('2d')
    if (!ctx || !mctx) return

    let animId: number

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      const camera = cameraRef.current
      const nodes = nodesRef.current
      const links = linksRef.current

      // Physics step if active
      if (isPhysicsActiveRef.current && nodes.length > 0) {
        const avgMotion = physicsTick()
        if (avgMotion < 0.05) {
          stableFramesRef.current++
          if (stableFramesRef.current > 90) {
            setIsPhysicsActive(false)
          }
        } else {
          stableFramesRef.current = 0
        }
      }

      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.translate(width / 2 + camera.x, height / 2 + camera.y)
      ctx.scale(camera.k, camera.k)

      // Viewport Bounds
      const halfW = (width / 2) / camera.k
      const halfH = (height / 2) / camera.k
      const cx = -camera.x / camera.k
      const cy = -camera.y / camera.k
      const minX = cx - halfW - 60
      const maxX = cx + halfW + 60
      const minY = cy - halfH - 60
      const maxY = cy + halfH + 60

      const visibleNodes = nodes.filter(n => n.x > minX && n.x < maxX && n.y > minY && n.y < maxY)
      const visibleSet = new Set(visibleNodes.map(n => n.id))

      // Draw Links
      ctx.lineWidth = 1.1
      links.forEach(l => {
        if (!visibleSet.has(l.source.id) && !visibleSet.has(l.target.id)) return
        ctx.beginPath()
        ctx.moveTo(l.source.x, l.source.y)
        ctx.lineTo(l.target.x, l.target.y)
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)'
        ctx.stroke()
      })

      const lod = camera.k > 1.15 ? 'high' : (camera.k > 0.55 ? 'mid' : 'low')

      // Draw Series Nodes
      visibleNodes.filter(n => n.type === 'series').forEach(n => {
        const isSelected = selectedNode && selectedNode.id === n.id
        const isHovered = hoveredNode && hoveredNode.id === n.id

        if (lod === 'high' && n.raw && n.raw.cover_url) {
          const entry = getImage(n.raw.cover_url)
          ctx.save()
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
          ctx.clip()
          if (entry.loaded) {
            const iw = entry.img.width
            const ih = entry.img.height
            const scale = Math.max((n.radius * 2) / iw, (n.radius * 2) / ih)
            const dw = iw * scale
            const dh = ih * scale
            ctx.drawImage(entry.img, n.x - dw / 2, n.y - dh / 2, dw, dh)
          } else {
            ctx.fillStyle = n.color
            ctx.fillRect(n.x - n.radius, n.y - n.radius, n.radius * 2, n.radius * 2)
          }
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
          ctx.fillStyle = n.color
          if (isSelected || isHovered) {
            ctx.shadowColor = n.color
            ctx.shadowBlur = 18
          }
          ctx.fill()
          ctx.shadowBlur = 0
        }

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'
        ctx.lineWidth = isSelected ? 3 : 1.6
        ctx.stroke()

        if (isSelected || isHovered || lod === 'high') {
          ctx.font = '600 10px Inter, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          const label = n.label.length > 24 ? n.label.slice(0, 22) + '…' : n.label
          ctx.fillText(label, n.x, n.y + n.radius + 12)
        }
      })

      // Draw Publisher Hub Nodes (On Top)
      visibleNodes.filter(n => n.type === 'publisher').forEach(n => {
        const isSelected = selectedNode && selectedNode.id === n.id
        const isHovered = hoveredNode && hoveredNode.id === n.id

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius + 8, 0, Math.PI * 2)
        ctx.fillStyle = `${n.color}22`
        ctx.fill()

        // Gold Ring for Top Publisher
        if (n.id === topPublisherIdRef.current) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.radius + 5, 0, Math.PI * 2)
          ctx.strokeStyle = '#facc15'
          ctx.lineWidth = 2.5
          ctx.setLineDash([4, 3])
          ctx.stroke()
          ctx.setLineDash([])
        }

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.fillStyle = n.color
        if (isSelected || isHovered) {
          ctx.shadowColor = n.color
          ctx.shadowBlur = 20
        }
        ctx.fill()
        ctx.shadowBlur = 0

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.strokeStyle = isSelected ? '#ffffff' : '#ffffff'
        ctx.lineWidth = isSelected ? 3.5 : 2.5
        ctx.stroke()

        const fontSize = Math.round(11 + Math.min(n.radius / 58, 1) * 5)
        ctx.font = `800 ${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffffff'
        const crown = n.id === topPublisherIdRef.current ? '👑 ' : ''
        ctx.fillText(crown + n.label, n.x, n.y - n.radius - 10)

        ctx.font = '700 10px Inter, sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.fillText(`${n.count || 0} series`, n.x, n.y - n.radius - 10 - fontSize)
      })

      ctx.restore()

      // Draw Minimap
      const mw = minimapCanvas.width
      const mh = minimapCanvas.height
      mctx.clearRect(0, 0, mw, mh)

      if (nodes.length > 0) {
        let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
        nodes.forEach(n => {
          mnX = Math.min(mnX, n.x); mxX = Math.max(mxX, n.x)
          mnY = Math.min(mnY, n.y); mxY = Math.max(mxY, n.y)
        })
        const spanX = Math.max(1, mxX - mnX)
        const spanY = Math.max(1, mxY - mnY)
        const pad = 10
        const scale = Math.min((mw - pad * 2) / spanX, (mh - pad * 2) / spanY)
        const toMini = (x: number, y: number) => [pad + (x - mnX) * scale, pad + (y - mnY) * scale]

        nodes.forEach(n => {
          const [mx, my] = toMini(n.x, n.y)
          mctx.beginPath()
          mctx.arc(mx, my, n.type === 'publisher' ? 3 : 1.4, 0, Math.PI * 2)
          mctx.fillStyle = n.color
          mctx.fill()
        })

        const [rx1, ry1] = toMini(cx - halfW, cy - halfH)
        const [rx2, ry2] = toMini(cx + halfW, cy + halfH)
        mctx.strokeStyle = 'rgba(255,255,255,0.8)'
        mctx.lineWidth = 1.5
        mctx.strokeRect(rx1, ry1, rx2 - rx1, ry2 - ry1)
      }

      setZoomPercent(Math.round(camera.k * 100))
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [physicsTick, getImage, selectedNode, hoveredNode])

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      const minimapCanvas = minimapCanvasRef.current
      if (!canvas || !minimapCanvas) return

      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth
        canvas.height = canvas.parentElement.clientHeight
      }
      if (minimapCanvas.parentElement) {
        minimapCanvas.width = minimapCanvas.parentElement.clientWidth
        minimapCanvas.height = minimapCanvas.parentElement.clientHeight
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Hit test node helper
  const nodeAtScreenPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const camera = cameraRef.current
    const mx = (clientX - rect.left - canvas.width / 2 - camera.x) / camera.k
    const my = (clientY - rect.top - canvas.height / 2 - camera.y) / camera.k

    let best: NodeData | null = null
    let bestDist = Infinity
    for (const n of nodesRef.current) {
      const d = Math.hypot(n.x - mx, n.y - my)
      if (d <= n.radius && d < bestDist) {
        best = n
        bestDist = d
      }
    }
    return best
  }, [])

  // Canvas Mouse Interaction Handlers
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = nodeAtScreenPoint(e.clientX, e.clientY)
    if (hit) {
      if (hit.type === 'series') {
        setSelectedNode(hit)
      } else if (hit.type === 'publisher') {
        // Center camera on publisher hub
        cameraRef.current.x = -hit.x * cameraRef.current.k
        cameraRef.current.y = -hit.y * cameraRef.current.k
      }
    }
  }, [nodeAtScreenPoint])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = nodeAtScreenPoint(e.clientX, e.clientY)
    setHoveredNode(hit)

    const tooltip = tooltipRef.current
    if (hit && tooltip) {
      const canvas = canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        tooltip.style.left = `${e.clientX - rect.left}px`
        tooltip.style.top = `${e.clientY - rect.top}px`
        tooltip.innerText = hit.type === 'publisher'
          ? hit.label
          : `${hit.label} · ${hit.raw?.publisher || ''}`
      }
    }

    if (isDraggingRef.current) {
      cameraRef.current.x = camStartRef.current.x + (e.clientX - dragStartRef.current.x)
      cameraRef.current.y = camStartRef.current.y + (e.clientY - dragStartRef.current.y)
    }
  }, [nodeAtScreenPoint])

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = nodeAtScreenPoint(e.clientX, e.clientY)
    if (hit) return

    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    camStartRef.current = { x: cameraRef.current.x, y: cameraRef.current.y }
  }, [nodeAtScreenPoint])

  const handleCanvasMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const handleCanvasWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left - canvas.width / 2
    const my = e.clientY - rect.top - canvas.height / 2
    const preK = cameraRef.current.k
    const factor = e.deltaY < 0 ? 1.15 : 0.85
    const newK = Math.max(0.15, Math.min(4, cameraRef.current.k * factor))
    const ratio = newK / preK
    cameraRef.current.k = newK
    cameraRef.current.x = mx - (mx - cameraRef.current.x) * ratio
    cameraRef.current.y = my - (my - cameraRef.current.y) * ratio
  }, [])

  // Camera Control Actions
  const handleZoomIn = () => {
    cameraRef.current.k = Math.min(4, cameraRef.current.k * 1.25)
  }

  const handleZoomOut = () => {
    cameraRef.current.k = Math.max(0.15, cameraRef.current.k * 0.8)
  }

  const handleResetCamera = () => {
    cameraRef.current.x = 0
    cameraRef.current.y = 0
    cameraRef.current.k = 0.42
    setSelectedNode(null)
  }

  const handleToggleAllPublishers = () => {
    if (activePublishers.size === publisherStats.list.length) {
      setActivePublishers(new Set())
    } else {
      setActivePublishers(new Set(publisherStats.list.map(p => p.name)))
    }
  }

  const handlePublisherToggle = (pubName: string) => {
    const next = new Set(activePublishers)
    if (next.has(pubName)) {
      next.delete(pubName)
    } else {
      next.add(pubName)
    }
    setActivePublishers(next)
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-[#f8fafc] font-sans relative overflow-x-hidden"
      style={{
        backgroundImage: `
          radial-gradient(circle at 15% 15%, rgba(99, 102, 241, 0.12) 0%, transparent 40%),
          radial-gradient(circle at 85% 85%, rgba(168, 85, 247, 0.12) 0%, transparent 40%)
        `
      }}>
      <div className="max-w-[1700px] mx-auto px-4 py-5">
        
        {/* Header Hero Section */}
        <div className="rounded-3xl p-6 text-center mb-4 relative overflow-hidden bg-slate-900/75 backdrop-blur-xl border border-white/10 shadow-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mb-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            {vi ? 'Đang tiến hành phát hành (Currently Publishing)' : 'Currently Publishing'}
          </div>

          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent mb-1.5">
            {vi ? 'Mạng Lưới Bản Quyền Light Novel' : 'Light Novel Publishing Network'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 max-w-3xl mx-auto font-medium mb-4">
            {vi
              ? `Sơ đồ mạng lưới lực vật lý tương tác — ${summaryMetrics.ongoingCount} đầu series trên ${summaryMetrics.pubCount} nhà xuất bản. Thu phóng để xem ảnh bìa, cuộn danh sách NXB bên trái để lọc nhanh.`
              : `Interactive force-directed graph — ${summaryMetrics.ongoingCount} series across ${summaryMetrics.pubCount} publishers.`}
          </p>

          {/* Stats Bar Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 max-w-4xl mx-auto">
            <div className="bg-slate-950/40 border border-white/10 rounded-xl p-2.5 text-center">
              <div className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                {vi ? 'Đang hiển thị' : 'Showing'}
              </div>
              <div className="text-lg font-black text-emerald-400 mt-0.5">
                {summaryMetrics.ongoingCount} series
              </div>
            </div>

            <div className="bg-slate-950/40 border border-white/10 rounded-xl p-2.5 text-center">
              <div className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                {vi ? 'NXB' : 'Publishers'}
              </div>
              <div className="text-lg font-black text-indigo-400 mt-0.5">
                {summaryMetrics.pubCount} NXB
              </div>
            </div>

            <div className="bg-slate-950/40 border border-white/10 rounded-xl p-2.5 text-center">
              <div className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                {vi ? 'Số tập đã ra' : 'Released Vols'}
              </div>
              <div className="text-lg font-black text-amber-400 mt-0.5">
                {summaryMetrics.totalVols.toLocaleString()} tập
              </div>
            </div>

            <div className="bg-slate-950/40 border border-white/10 rounded-xl p-2.5 text-center">
              <div className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                {vi ? 'Điểm LN Score TB' : 'Avg Score'}
              </div>
              <div className="text-lg font-black text-cyan-400 mt-0.5">
                {summaryMetrics.avgScore} pts
              </div>
            </div>

            <div className="bg-slate-950/40 border border-white/10 rounded-xl p-2.5 text-center col-span-2 sm:col-span-1">
              <div className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                {vi ? 'NXB dẫn đầu' : 'Leader Pub'}
              </div>
              <div className="text-lg font-black truncate mt-0.5" style={{ color: publisherStats.topPublisher?.color || '#ffffff' }}>
                {publisherStats.topPublisher?.name || '—'}
              </div>
              {publisherStats.topPublisher && (
                <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                  {Math.round((publisherStats.topPublisher.count / publisherStats.totalCount) * 100)}% {vi ? 'thị phần' : 'share'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls Filter Bar */}
        <div className="rounded-2xl p-3.5 mb-3.5 flex flex-wrap items-center justify-between gap-3 bg-slate-900/75 backdrop-blur-xl border border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-extrabold uppercase text-slate-500 tracking-wider mr-1">
              {vi ? 'Trạng thái:' : 'Status:'}
            </span>
            
            <button
              type="button"
              onClick={() => setStatusFilter('ongoing')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                statusFilter === 'ongoing'
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-[0_4px_14px_rgba(16,185,129,0.35)]'
                  : 'bg-slate-950/50 text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              {vi ? 'Đang tiến hành' : 'Ongoing'}
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                statusFilter === 'completed'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-[0_4px_14px_rgba(168,85,247,0.35)]'
                  : 'bg-slate-950/50 text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              {vi ? 'Hoàn thành' : 'Completed'}
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                statusFilter === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-[0_4px_14px_rgba(99,102,241,0.35)]'
                  : 'bg-slate-950/50 text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              {vi ? 'Tất cả' : 'All'}
            </button>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={vi ? 'Tìm series / NPH...' : 'Search title / pub...'}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-bold bg-slate-950/60 text-white border border-white/10 outline-none focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3.5">
          
          {/* Left Publisher Legend Panel */}
          <div className="rounded-2xl p-3.5 bg-slate-900/75 backdrop-blur-xl border border-white/10 flex flex-col gap-2.5 max-h-[760px] overflow-y-auto">
            <div className="text-[11px] font-extrabold uppercase text-slate-500 tracking-wider flex justify-between items-center">
              <span>{vi ? 'Nhà xuất bản' : 'Publishers'}</span>
              <button
                type="button"
                onClick={handleToggleAllPublishers}
                className="text-[10px] font-bold text-indigo-400 hover:underline cursor-pointer lowercase"
              >
                {activePublishers.size === publisherStats.list.length ? (vi ? 'Bỏ chọn' : 'Deselect all') : (vi ? 'Chọn tất cả' : 'Select all')}
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {publisherStats.list.map((p, idx) => {
                const isActive = activePublishers.has(p.name)
                const barPct = Math.max(6, Math.round((p.count / publisherStats.maxCount) * 100))
                const medal = ['🥇', '🥈', '🥉'][idx] || `${idx + 1}`

                return (
                  <div
                    key={p.name}
                    onClick={() => handlePublisherToggle(p.name)}
                    className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all border border-transparent font-bold text-xs ${
                      isActive
                        ? 'text-slate-300 hover:bg-white/5'
                        : 'opacity-30 hover:opacity-70'
                    }`}
                  >
                    <span className="w-4 flex-shrink-0 text-center text-[11px] text-slate-400 font-extrabold">
                      {medal}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}` }}
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{p.name}</span>
                        <span className="text-[10px] font-extrabold text-slate-400 bg-white/5 rounded-full px-1.5 py-0.5">
                          {p.count}
                        </span>
                      </div>
                      <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${barPct}%`, backgroundColor: p.color }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Canvas Workspace */}
          <div className="relative h-[760px] rounded-3xl overflow-hidden shadow-2xl bg-slate-900/75 backdrop-blur-xl border border-white/10">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              onWheel={handleCanvasWheel}
              className="w-full h-full cursor-grab active:cursor-grabbing block"
            />

            {/* Hover Tooltip */}
            <div
              ref={tooltipRef}
              className="absolute pointer-events-none z-50 px-2.5 py-1.5 rounded-lg bg-slate-950/90 border border-white/10 text-xs font-bold text-white shadow-xl -translate-x-1/2 -translate-y-[130%] whitespace-nowrap hidden"
            />

            {/* Top Right Node/Link Counter */}
            <div className="absolute top-4 left-4 px-3.5 py-2 rounded-full text-xs font-extrabold z-20 text-slate-400 bg-slate-950/60 backdrop-blur-md border border-white/10">
              <b className="text-white">{filteredData.length}</b> series &middot; <b className="text-white">{filteredData.length}</b> liên kết
            </div>

            {/* Interactive Minimap */}
            <div className="absolute top-4 right-4 w-44 h-28 rounded-2xl overflow-hidden z-20 cursor-pointer bg-slate-950/60 backdrop-blur-md border border-white/10">
              <canvas ref={minimapCanvasRef} className="w-full h-full" />
            </div>

            {/* Floating Toolbar Controls */}
            <div className="absolute left-4 bottom-4 p-2 rounded-2xl flex items-center gap-1.5 z-20 bg-slate-950/60 backdrop-blur-md border border-white/10">
              <button
                type="button"
                onClick={handleZoomIn}
                title={vi ? 'Phóng to' : 'Zoom In'}
                className="w-8 h-8 rounded-lg bg-slate-950/60 border border-white/10 text-white flex items-center justify-center hover:bg-indigo-500/20 hover:border-indigo-500 transition-all font-bold"
              >
                +
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title={vi ? 'Thu nhỏ' : 'Zoom Out'}
                className="w-8 h-8 rounded-lg bg-slate-950/60 border border-white/10 text-white flex items-center justify-center hover:bg-indigo-500/20 hover:border-indigo-500 transition-all font-bold"
              >
                -
              </button>
              <button
                type="button"
                onClick={handleResetCamera}
                title={vi ? 'Đặt lại camera' : 'Reset Camera'}
                className="w-8 h-8 rounded-lg bg-slate-950/60 border border-white/10 text-white flex items-center justify-center hover:bg-indigo-500/20 hover:border-indigo-500 transition-all font-bold"
              >
                ↺
              </button>
              <button
                type="button"
                onClick={() => setIsPhysicsActive(!isPhysicsActive)}
                title={vi ? 'Chạy/dừng mô phỏng' : 'Toggle Physics'}
                className="w-8 h-8 rounded-lg bg-slate-950/60 border border-white/10 text-white flex items-center justify-center hover:bg-indigo-500/20 hover:border-indigo-500 transition-all font-bold"
              >
                {isPhysicsActive ? '⏸' : '▶'}
              </button>
              <button
                type="button"
                onClick={() => setClusterMode(!clusterMode)}
                title={vi ? 'Chế độ gom cụm NXB' : 'Toggle Cluster'}
                className={`px-2.5 h-8 rounded-lg text-xs font-extrabold border transition-all ${
                  clusterMode ? 'bg-indigo-500/30 border-indigo-500 text-white' : 'bg-slate-950/60 border-white/10 text-slate-400'
                }`}
              >
                {vi ? 'Cụm' : 'Cluster'}
              </button>
            </div>

            {/* Bottom Center Zoom Indicator */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-4 px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-400 z-20 bg-slate-950/60 backdrop-blur-md border border-white/10 hidden sm:flex items-center gap-2">
              Zoom <b className="text-white">{zoomPercent}%</b> — {vi ? 'nhấn ▶ để chạy mô phỏng, phóng to để xem ảnh bìa' : 'press ▶ to step simulation, zoom in for covers'}
            </div>

            {/* Floating Side Drawer for Selected Series Node */}
            {selectedNode && selectedNode.raw && (
              <div className="absolute right-0 top-0 bottom-0 w-80 sm:w-96 p-5 z-40 overflow-y-auto flex flex-col justify-between bg-slate-900/90 backdrop-blur-2xl border-l border-white/10 shadow-[-15px_0_40px_rgba(0,0,0,0.5)] transition-all animate-in slide-in-from-right duration-300">
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-white/10 mb-4">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-emerald-400 tracking-wider">
                        {vi ? 'Chi tiết Light Novel' : 'Light Novel Details'}
                      </span>
                      <div className="text-base font-black text-white leading-snug mt-0.5">
                        {selectedNode.raw.series_title || selectedNode.raw.title_vi}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedNode(null)}
                      className="bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Cover image & main info */}
                  <div className="flex gap-3.5 items-center mb-4">
                    {selectedNode.raw.cover_url ? (
                      <img
                        src={selectedNode.raw.cover_url}
                        alt={selectedNode.raw.series_title}
                        className="w-20 h-28 rounded-xl object-cover border border-white/10 shadow-lg bg-slate-800"
                      />
                    ) : (
                      <div className="w-20 h-28 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-500">
                        No Cover
                      </div>
                    )}
                    <div className="flex-1 flex flex-col gap-2 min-w-0">
                      <div>
                        <div className="text-[10px] font-extrabold uppercase text-slate-500">{vi ? 'Nhà xuất bản' : 'Publisher'}</div>
                        <div className="text-xs font-bold text-emerald-400 truncate">{selectedNode.raw.publisher}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-extrabold uppercase text-slate-500">{vi ? 'Trạng thái' : 'Status'}</div>
                        <div className="text-xs font-bold text-white">{selectedNode.raw.trang_thai || selectedNode.raw.original_status || '—'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Detail Grid */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-slate-950/50 border border-white/10 rounded-xl p-2.5">
                      <div className="text-[10px] font-extrabold uppercase text-slate-500">{vi ? 'Số tập phát hành' : 'Released Volumes'}</div>
                      <div className="text-sm font-black text-amber-400 mt-0.5">{selectedNode.raw.number_of_volumes || 0} tập</div>
                    </div>
                    <div className="bg-slate-950/50 border border-white/10 rounded-xl p-2.5">
                      <div className="text-[10px] font-extrabold uppercase text-slate-500">{vi ? 'Điểm LN Score' : 'LN Score'}</div>
                      <div className="text-sm font-black text-cyan-400 mt-0.5">{selectedNode.raw.ln_score ? `${selectedNode.raw.ln_score} pts` : 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Content Link Button */}
                <Link
                  href={selectedNode.raw.lidex_series_id ? `/content/${selectedNode.raw.lidex_series_id}` : '/content'}
                  className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_10px_25px_rgba(99,102,241,0.4)] transition-all transform hover:-translate-y-0.5"
                >
                  {vi ? 'Xem chi tiết tác phẩm ↗' : 'View Series Details ↗'}
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
