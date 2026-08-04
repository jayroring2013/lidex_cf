'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Network, Search, Filter, Layers, Maximize2, Minimize2,
  Play, Pause, RotateCcw, ZoomIn, ZoomOut, Sparkles,
  BookOpen, Building2, ExternalLink, X, ChevronRight,
  Info, Sliders, Check, RefreshCw
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

interface GraphNode {
  id: string
  label: string
  type: 'publisher' | 'series' | 'genre'
  status?: string
  rawItem?: NovelNetworkItem
  x: number
  y: number
  vx: number
  vy: number
  fx?: number | null
  fy?: number | null
  radius: number
  color: string
  borderColor: string
  volumeCount?: number
  score?: number
  publisherName?: string
  coverUrl?: string | null
  degree: number
}

interface GraphLink {
  source: string
  target: string
  type: 'publisher' | 'genre'
  strength: number
}

const PUBLISHER_COLORS: Record<string, string> = {
  'IPM': '#10b981',        // Emerald
  'Kim Đồng': '#ef4444',   // Red
  'NXB Trẻ': '#f59e0b',    // Amber
  'Hikari': '#06b6d4',     // Cyan
  'Amak': '#8b5cf6',       // Purple
  'Tsukinoki': '#ec4899',  // Pink
  'Taiyo': '#f97316',      // Orange
  'Odex': '#3b82f6',       // Blue
}

function getPublisherColor(pubName: string): string {
  for (const [key, color] of Object.entries(PUBLISHER_COLORS)) {
    if (pubName.toLowerCase().includes(key.toLowerCase())) return color
  }
  return '#a855f7' // Fallback violet
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('tiến hành') || s.includes('đang ra') || s.includes('ongoing')) return '#10b981' // Green
  if (s.includes('hoàn thành') || s.includes('completed')) return '#a855f7' // Purple
  if (s.includes('tạm ngưng') || s.includes('drop') || s.includes('hiatus')) return '#f59e0b' // Amber
  return '#64748b' // Slate
}

export default function NovelNetworkClient({ initialData }: { initialData: NovelNetworkItem[] }) {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  // Canvas and Container Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const requestRef = useRef<number | null>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  // State Filters
  // Default status filter is 'ongoing' (Đang tiến hành) as requested
  const [statusFilter, setStatusFilter] = useState<'ongoing' | 'completed' | 'all'>('ongoing')
  const [publisherFilter, setPublisherFilter] = useState<string>('all')
  const [genreFilter, setGenreFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [layoutMode, setLayoutMode] = useState<'publisher' | 'genre' | 'hybrid'>('publisher')
  
  // Physics Controls
  const [isPlaying, setIsPlaying] = useState<boolean>(true)
  const [showLabels, setShowLabels] = useState<boolean>(true)
  const [repulsionStrength, setRepulsionStrength] = useState<number>(180)
  const [linkDistance, setLinkDistance] = useState<number>(100)

  // Interactive Selection State
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  // Camera Zoom/Pan Matrix
  const transformRef = useRef({ x: 0, y: 0, k: 1 })

  // List of unique Publishers & Genres for filtering
  const uniquePublishers = useMemo(() => {
    const pubs = new Set<string>()
    initialData.forEach(item => {
      if (item.publisher) pubs.add(item.publisher)
    })
    return Array.from(pubs).sort()
  }, [initialData])

  const uniqueGenres = useMemo(() => {
    const genres = new Set<string>()
    initialData.forEach(item => {
      if (Array.isArray(item.genres)) {
        item.genres.forEach(g => genres.add(g))
      }
    })
    return Array.from(genres).sort()
  }, [initialData])

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const ongoing = initialData.filter(i => {
      const s = (i.trang_thai || '').toLowerCase()
      return s.includes('tiến hành') || s.includes('đang ra') || s.includes('ongoing')
    })
    const totalVols = initialData.reduce((acc, curr) => acc + (curr.number_of_volumes || 0), 0)
    const validScores = initialData.filter(i => typeof i.ln_score === 'number' && i.ln_score > 0)
    const avgScore = validScores.length > 0 
      ? (validScores.reduce((acc, curr) => acc + (curr.ln_score || 0), 0) / validScores.length).toFixed(1)
      : 'N/A'

    return {
      ongoingCount: ongoing.length,
      totalCount: initialData.length,
      publisherCount: uniquePublishers.length,
      totalVols,
      avgScore
    }
  }, [initialData, uniquePublishers])

  // Build Filtered Dataset for Graph
  const filteredData = useMemo(() => {
    return initialData.filter(item => {
      // 1. Status Filter
      if (statusFilter === 'ongoing') {
        const s = (item.trang_thai || '').toLowerCase()
        if (!s.includes('tiến hành') && !s.includes('đang ra') && !s.includes('ongoing')) {
          return false
        }
      } else if (statusFilter === 'completed') {
        const s = (item.trang_thai || '').toLowerCase()
        if (!s.includes('hoàn thành') && !s.includes('completed')) {
          return false
        }
      }

      // 2. Publisher Filter
      if (publisherFilter !== 'all' && item.publisher !== publisherFilter) {
        return false
      }

      // 3. Genre Filter
      if (genreFilter !== 'all') {
        if (!Array.isArray(item.genres) || !item.genres.includes(genreFilter)) {
          return false
        }
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchTitle = item.series_title.toLowerCase().includes(q)
        const matchTitleVi = (item.title_vi || '').toLowerCase().includes(q)
        const matchPub = item.publisher.toLowerCase().includes(q)
        if (!matchTitle && !matchTitleVi && !matchPub) {
          return false
        }
      }

      return true
    })
  }, [initialData, statusFilter, publisherFilter, genreFilter, searchQuery])

  // Construct Nodes & Edges graph structure
  const graphStructure = useMemo(() => {
    const nodesMap = new Map<string, GraphNode>()
    const links: GraphLink[] = []

    // 1. Collect unique publishers in filtered data
    const activePublishers = new Set<string>()
    const activeGenres = new Set<string>()

    filteredData.forEach(item => {
      if (item.publisher) activePublishers.add(item.publisher)
      if (Array.isArray(item.genres) && layoutMode !== 'publisher') {
        item.genres.slice(0, 3).forEach(g => activeGenres.add(g))
      }
    })

    // 2. Create Publisher Hub Nodes
    let pubAngle = 0
    const pubRadiusStep = 280
    activePublishers.forEach(pub => {
      const angle = (pubAngle / activePublishers.size) * Math.PI * 2
      const x = Math.cos(angle) * pubRadiusStep
      const y = Math.sin(angle) * pubRadiusStep
      pubAngle++

      nodesMap.set(`pub_${pub}`, {
        id: `pub_${pub}`,
        label: pub,
        type: 'publisher',
        x: x + (Math.random() - 0.5) * 50,
        y: y + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        radius: 28,
        color: getPublisherColor(pub),
        borderColor: '#ffffff',
        publisherName: pub,
        degree: 0,
      })
    })

    // 3. Create Genre Hub Nodes (if layoutMode includes genres)
    if (layoutMode === 'genre' || layoutMode === 'hybrid') {
      let gAngle = 0
      const gRadiusStep = 380
      activeGenres.forEach(genre => {
        const angle = (gAngle / activeGenres.size) * Math.PI * 2
        const x = Math.cos(angle) * gRadiusStep
        const y = Math.sin(angle) * gRadiusStep
        gAngle++

        nodesMap.set(`genre_${genre}`, {
          id: `genre_${genre}`,
          label: genre,
          type: 'genre',
          x: x + (Math.random() - 0.5) * 50,
          y: y + (Math.random() - 0.5) * 50,
          vx: 0,
          vy: 0,
          radius: 22,
          color: '#ec4899', // Neon pink for genres
          borderColor: '#ffffff',
          degree: 0,
        })
      })
    }

    // 4. Create Series Nodes & Edges
    filteredData.forEach(item => {
      const seriesId = `series_${item.id}`
      const pubNodeId = `pub_${item.publisher}`

      // Node size scaled by volume count or score
      const vols = item.number_of_volumes || 1
      const radius = Math.max(14, Math.min(24, 12 + Math.sqrt(vols) * 2.5))
      const statusCol = getStatusColor(item.trang_thai)

      // Initial position clustered near publisher hub if available
      const pubNode = nodesMap.get(pubNodeId)
      const baseDist = 120 + Math.random() * 140
      const baseAngle = Math.random() * Math.PI * 2
      const initX = pubNode ? pubNode.x + Math.cos(baseAngle) * baseDist : (Math.random() - 0.5) * 600
      const initY = pubNode ? pubNode.y + Math.sin(baseAngle) * baseDist : (Math.random() - 0.5) * 600

      const seriesNode: GraphNode = {
        id: seriesId,
        label: item.series_title,
        type: 'series',
        status: item.trang_thai,
        rawItem: item,
        x: initX,
        y: initY,
        vx: 0,
        vy: 0,
        radius,
        color: getPublisherColor(item.publisher),
        borderColor: statusCol,
        volumeCount: item.number_of_volumes || 0,
        score: item.ln_score || 0,
        publisherName: item.publisher,
        coverUrl: item.cover_url,
        degree: 0,
      }

      nodesMap.set(seriesId, seriesNode)

      // Add Edge to Publisher Hub
      if (nodesMap.has(pubNodeId)) {
        links.push({
          source: seriesId,
          target: pubNodeId,
          type: 'publisher',
          strength: 0.8
        })

        // Increment degree
        seriesNode.degree++
        const pNode = nodesMap.get(pubNodeId)
        if (pNode) pNode.degree++
      }

      // Add Edge to Genre Hubs
      if ((layoutMode === 'genre' || layoutMode === 'hybrid') && Array.isArray(item.genres)) {
        item.genres.slice(0, 2).forEach(g => {
          const gNodeId = `genre_${g}`
          if (nodesMap.has(gNodeId)) {
            links.push({
              source: seriesId,
              target: gNodeId,
              type: 'genre',
              strength: 0.3
            })
            seriesNode.degree++
            const gNode = nodesMap.get(gNodeId)
            if (gNode) gNode.degree++
          }
        })
      }
    })

    return {
      nodes: Array.from(nodesMap.values()),
      links,
      nodesMap
    }
  }, [filteredData, layoutMode])

  // Preload images into cache
  useEffect(() => {
    const cache = imageCacheRef.current
    graphStructure.nodes.forEach(node => {
      if (node.coverUrl && !cache.has(node.coverUrl)) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = node.coverUrl
        img.onload = () => {
          cache.set(node.coverUrl!, img)
        }
      }
    })
  }, [graphStructure.nodes])

  // Set of Connected Neighbors for currently selected / hovered node
  const neighborSet = useMemo(() => {
    const target = hoveredNode || selectedNode
    if (!target) return null

    const set = new Set<string>()
    set.add(target.id)

    graphStructure.links.forEach(link => {
      if (link.source === target.id) set.add(link.target)
      if (link.target === target.id) set.add(link.source)
    })

    return set
  }, [hoveredNode, selectedNode, graphStructure.links])

  // Force-Directed Physics Simulation Engine
  const runPhysicsSimulationStep = useCallback((nodes: GraphNode[], links: GraphLink[], alpha: number) => {
    if (alpha <= 0.001) return

    const nodeById = new Map<string, GraphNode>()
    nodes.forEach(n => nodeById.set(n.id, n))

    // 1. Repulsion force between all nodes (Coulomb law)
    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j]
        const dx = nodeB.x - nodeA.x || 0.01
        const dy = nodeB.y - nodeA.y || 0.01
        const distSq = dx * dx + dy * dy
        const dist = Math.sqrt(distSq) || 0.01

        const minDist = nodeA.radius + nodeB.radius + 15
        let force = (repulsionStrength * repulsionStrength) / (distSq + 100)

        // Extra repulsion if overlapping
        if (dist < minDist) {
          force += (minDist - dist) * 0.5
        }

        const fx = (dx / dist) * force * alpha
        const fy = (dy / dist) * force * alpha

        if (!nodeA.fx) {
          nodeA.vx -= fx
          nodeA.vy -= fy
        }
        if (!nodeB.fx) {
          nodeB.vx += fx
          nodeB.vy += fy
        }
      }
    }

    // 2. Link Attraction force (Hooke's Law)
    links.forEach(link => {
      const source = nodeById.get(link.source)
      const target = nodeById.get(link.target)
      if (!source || !target) return

      const dx = target.x - source.x || 0.01
      const dy = target.y - source.y || 0.01
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const desiredDist = linkDistance * (link.type === 'publisher' ? 1 : 1.4)
      const displacement = dist - desiredDist

      const force = displacement * 0.05 * link.strength * alpha
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      if (!source.fx) {
        source.vx += fx
        source.vy += fy
      }
      if (!target.fx) {
        target.vx -= fx
        target.vy -= fy
      }
    })

    // 3. Central Gravity Pull
    nodes.forEach(node => {
      const distCenter = Math.sqrt(node.x * node.x + node.y * node.y) || 0.01
      const gravity = 0.012 * alpha * (node.type === 'publisher' ? 0.5 : 1)
      if (!node.fx) {
        node.vx -= (node.x / distCenter) * gravity * distCenter
        node.vy -= (node.y / distCenter) * gravity * distCenter
      }

      // Damping / Friction
      node.vx *= 0.88
      node.vy *= 0.88

      // Update Position
      if (!node.fx) node.x += node.vx
      if (!node.fy) node.y += node.vy
    })
  }, [repulsionStrength, linkDistance])

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let alpha = 1

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      const transform = transformRef.current

      // Clear Canvas
      ctx.clearRect(0, 0, width, height)

      ctx.save()
      // Apply Camera Transform Matrix
      ctx.translate(width / 2 + transform.x, height / 2 + transform.y)
      ctx.scale(transform.k, transform.k)

      const nodes = graphStructure.nodes
      const links = graphStructure.links
      const nodeById = graphStructure.nodesMap

      // Run Physics step if active
      if (isPlaying && alpha > 0.005) {
        runPhysicsSimulationStep(nodes, links, alpha)
        alpha *= 0.99
      }

      // 1. Draw Links
      links.forEach(link => {
        const source = nodeById.get(link.source)
        const target = nodeById.get(link.target)
        if (!source || !target) return

        const isHighlighted = neighborSet
          ? neighborSet.has(source.id) && neighborSet.has(target.id)
          : true

        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)

        if (neighborSet && !isHighlighted) {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)'
          ctx.lineWidth = 1
        } else if (isHighlighted && neighborSet) {
          ctx.strokeStyle = source.color
          ctx.lineWidth = 2.5
          ctx.shadowColor = source.color
          ctx.shadowBlur = 8
        } else {
          ctx.strokeStyle = link.type === 'publisher' ? 'rgba(99, 102, 241, 0.22)' : 'rgba(236, 72, 153, 0.15)'
          ctx.lineWidth = link.type === 'publisher' ? 1.5 : 1
          ctx.shadowBlur = 0
        }

        ctx.stroke()
        ctx.shadowBlur = 0
      })

      // 2. Draw Nodes
      nodes.forEach(node => {
        const isSelected = selectedNode?.id === node.id
        const isHovered = hoveredNode?.id === node.id
        const isDimmed = neighborSet ? !neighborSet.has(node.id) : false

        ctx.save()
        ctx.globalAlpha = isDimmed ? 0.18 : 1

        // Publisher / Genre Hub Ring Aura
        if (node.type === 'publisher' || node.type === 'genre') {
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2)
          ctx.fillStyle = `${node.color}20`
          ctx.fill()
        }

        // Draw Base Node Circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = node.color

        if (isSelected || isHovered) {
          ctx.shadowColor = node.color
          ctx.shadowBlur = 18
        }
        ctx.fill()
        ctx.shadowBlur = 0

        // Draw Image Cover for Series Node
        if (node.type === 'series' && node.coverUrl) {
          const cachedImg = imageCacheRef.current.get(node.coverUrl)
          if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
            ctx.save()
            ctx.beginPath()
            ctx.arc(node.x, node.y, node.radius - 2, 0, Math.PI * 2)
            ctx.clip()

            ctx.drawImage(
              cachedImg,
              node.x - node.radius,
              node.y - node.radius,
              node.radius * 2,
              node.radius * 2
            )
            ctx.restore()
          }
        }

        // Node Border Ring
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.lineWidth = isSelected ? 3.5 : (node.type === 'series' ? 2.5 : 3)
        ctx.strokeStyle = isSelected ? '#ffffff' : node.borderColor
        ctx.stroke()

        // Status Indicator Dot for Series Nodes (Emerald dot for currently publishing)
        if (node.type === 'series') {
          const isOngoing = (node.status || '').toLowerCase().includes('tiến hành') || (node.status || '').toLowerCase().includes('đang ra')
          if (isOngoing) {
            ctx.beginPath()
            ctx.arc(node.x + node.radius * 0.7, node.y - node.radius * 0.7, 5, 0, Math.PI * 2)
            ctx.fillStyle = '#10b981'
            ctx.shadowColor = '#10b981'
            ctx.shadowBlur = 8
            ctx.fill()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5
            ctx.stroke()
            ctx.shadowBlur = 0
          }
        }

        // Text Label
        if (showLabels || isSelected || isHovered || node.type === 'publisher') {
          ctx.font = node.type === 'publisher' ? 'bold 13px Inter, sans-serif' : '600 11px Inter, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'

          const labelText = node.label
          const truncated = labelText.length > 24 ? labelText.slice(0, 22) + '…' : labelText

          // Text Background pill for readability
          const textWidth = ctx.measureText(truncated).width
          const textY = node.y + node.radius + 5
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
          ctx.beginPath()
          ctx.roundRect(node.x - textWidth / 2 - 5, textY - 2, textWidth + 10, 18, 6)
          ctx.fill()

          ctx.fillStyle = isSelected || isHovered ? '#6366f1' : '#ffffff'
          ctx.fillText(truncated, node.x, textY)
        }

        ctx.restore()
      })

      ctx.restore()

      requestRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [graphStructure, isPlaying, showLabels, selectedNode, hoveredNode, neighborSet, runPhysicsSimulationStep])

  // Handle Canvas Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Canvas Mouse & Drag Interactivity Handlers
  const draggingNodeRef = useRef<GraphNode | null>(null)
  const isPanningRef = useRef<boolean>(false)
  const startPanRef = useRef({ x: 0, y: 0 })

  const getCanvasMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const transform = transformRef.current

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Reverse transform to graph world coordinates
    const worldX = (mouseX - canvas.offsetWidth / 2 - transform.x) / transform.k
    const worldY = (mouseY - canvas.offsetHeight / 2 - transform.y) / transform.k

    return { x: worldX, y: worldY, rawX: mouseX, rawY: mouseY }
  }, [])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasMousePos(e)
    const nodes = graphStructure.nodes

    // Find node under mouse
    let hit: GraphNode | null = null
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      const dx = pos.x - node.x
      const dy = pos.y - node.y
      if (dx * dx + dy * dy <= node.radius * node.radius) {
        hit = node
        break
      }
    }

    if (hit) {
      draggingNodeRef.current = hit
      hit.fx = hit.x
      hit.fy = hit.y
      setSelectedNode(hit)
    } else {
      isPanningRef.current = true
      startPanRef.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasMousePos(e)

    if (draggingNodeRef.current) {
      const node = draggingNodeRef.current
      node.fx = pos.x
      node.fy = pos.y
      node.x = pos.x
      node.y = pos.y
      return
    }

    if (isPanningRef.current) {
      transformRef.current.x = e.clientX - startPanRef.current.x
      transformRef.current.y = e.clientY - startPanRef.current.y
      return
    }

    // Hover Detection
    const nodes = graphStructure.nodes
    let hit: GraphNode | null = null
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      const dx = pos.x - node.x
      const dy = pos.y - node.y
      if (dx * dx + dy * dy <= node.radius * node.radius) {
        hit = node
        break
      }
    }

    if (hit !== hoveredNode) {
      setHoveredNode(hit)
    }
  }

  const handleMouseUp = () => {
    if (draggingNodeRef.current) {
      draggingNodeRef.current.fx = null
      draggingNodeRef.current.fy = null
      draggingNodeRef.current = null
    }
    isPanningRef.current = false
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88
    const currentK = transformRef.current.k
    const nextK = Math.max(0.2, Math.min(4, currentK * zoomFactor))
    transformRef.current.k = nextK
  }

  // Zoom Control Actions
  const zoomIn = () => {
    transformRef.current.k = Math.min(4, transformRef.current.k * 1.25)
  }

  const zoomOut = () => {
    transformRef.current.k = Math.max(0.2, transformRef.current.k * 0.8)
  }

  const resetView = () => {
    transformRef.current = { x: 0, y: 0, k: 1 }
    setSelectedNode(null)
    setHoveredNode(null)
  }

  // Auto-focus camera on a searched or selected node
  const focusNode = useCallback((node: GraphNode) => {
    setSelectedNode(node)
    transformRef.current = {
      x: -node.x * transformRef.current.k,
      y: -node.y * transformRef.current.k,
      k: 1.4
    }
  }, [])

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-[1700px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        
        {/* Hero Title Header */}
        <div className="rounded-3xl p-5 sm:p-8 text-center mb-6 shadow-xl relative overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-primary-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            {vi ? 'Đang tiến hành phát hành' : 'Currently Publishing'}
          </div>

          <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight gradient-text">
            {vi ? 'Mạng Lưới Bản Quyền Light Novel' : 'Light Novel Ecosystem Network'}
          </h1>
          <p className="mt-2 text-xs sm:text-base max-w-3xl mx-auto font-medium" style={{ color: 'var(--foreground-secondary)' }}>
            {vi
              ? 'Khám phá biểu đồ mạng lưới tương tác kết nối tất cả các bộ Light Novel đang được xuất bản tại Việt Nam với Nhà xuất bản (IPM, Kim Đồng, Trẻ, Hikari, Amak...) và Thể loại.'
              : 'Interactive force-directed network graph exploring currently published Light Novel series in Vietnam, connected by Publishers and Genres.'}
          </p>

          {/* Top Quick Stats Pill Grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-4xl mx-auto">
            <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
              <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Đang tiến hành' : 'Currently Publishing'}
              </p>
              <p className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5">
                {summaryMetrics.ongoingCount} <span className="text-xs font-bold text-foreground-muted">/ {summaryMetrics.totalCount} series</span>
              </p>
            </div>

            <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
              <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'NXB Việt Nam' : 'VN Publishers'}
              </p>
              <p className="text-lg sm:text-xl font-black text-indigo-400 mt-0.5">
                {summaryMetrics.publisherCount} {vi ? 'NXB' : 'Pubs'}
              </p>
            </div>

            <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
              <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Số tập xuất bản' : 'Published Volumes'}
              </p>
              <p className="text-lg sm:text-xl font-black text-amber-400 mt-0.5">
                {summaryMetrics.totalVols} {vi ? 'tập' : 'vols'}
              </p>
            </div>

            <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
              <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Điểm LN TB' : 'Avg LN Score'}
              </p>
              <p className="text-lg sm:text-xl font-black text-cyan-400 mt-0.5">
                {summaryMetrics.avgScore} <span className="text-xs font-bold text-foreground-muted">pts</span>
              </p>
            </div>
          </div>
        </div>

        {/* Filter Control Bar */}
        <div className="rounded-2xl p-4 mb-6 shadow-md" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            
            {/* Left Controls: Status Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider mr-1 text-foreground-muted flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                {vi ? 'Trạng thái:' : 'Status:'}
              </span>
              <button
                type="button"
                onClick={() => setStatusFilter('ongoing')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border flex items-center gap-1.5 ${
                  statusFilter === 'ongoing' 
                    ? 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/20' 
                    : 'bg-background-secondary text-foreground-secondary border-card-border hover:text-foreground'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                {vi ? 'Đang tiến hành' : 'Currently Publishing'} ({summaryMetrics.ongoingCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                  statusFilter === 'completed' 
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-500/20' 
                    : 'bg-background-secondary text-foreground-secondary border-card-border hover:text-foreground'
                }`}
              >
                {vi ? 'Hoàn thành' : 'Completed'}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                  statusFilter === 'all' 
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-500/20' 
                    : 'bg-background-secondary text-foreground-secondary border-card-border hover:text-foreground'
                }`}
              >
                {vi ? 'Tất cả trạng thái' : 'All Statuses'}
              </button>
            </div>

            {/* Middle Controls: Select Dropdowns & Layout Presets */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Publisher Dropdown */}
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-foreground-muted" />
                <select
                  value={publisherFilter}
                  onChange={e => setPublisherFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-bold outline-none cursor-pointer"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
                >
                  <option value="all">{vi ? 'Tất cả NPH' : 'All Publishers'}</option>
                  {uniquePublishers.map(pub => (
                    <option key={pub} value={pub}>{pub}</option>
                  ))}
                </select>
              </div>

              {/* Genre Dropdown */}
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-foreground-muted" />
                <select
                  value={genreFilter}
                  onChange={e => setGenreFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-bold outline-none cursor-pointer"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
                >
                  <option value="all">{vi ? 'Tất cả Thể loại' : 'All Genres'}</option>
                  {uniqueGenres.map(genre => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>
              </div>

              {/* Layout Mode Selector */}
              <div className="flex items-center gap-1 bg-background-secondary p-1 rounded-xl border border-card-border">
                <button
                  type="button"
                  onClick={() => setLayoutMode('publisher')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                    layoutMode === 'publisher' ? 'bg-primary-500 text-white' : 'text-foreground-muted'
                  }`}
                  title={vi ? 'Nhóm theo NPH' : 'Cluster by Publisher'}
                >
                  {vi ? 'Cụm NXB' : 'Publishers'}
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('hybrid')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                    layoutMode === 'hybrid' ? 'bg-primary-500 text-white' : 'text-foreground-muted'
                  }`}
                  title={vi ? 'Mạng lưới tổng thể' : 'Hybrid Ecosystem'}
                >
                  {vi ? 'Tổng thể' : 'Hybrid'}
                </button>
              </div>
            </div>

            {/* Right Controls: Live Search */}
            <div className="relative w-full lg:w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={vi ? 'Tìm series / NPH…' : 'Search series / pub…'}
                className="w-full pl-10 pr-3 py-2 rounded-xl text-xs sm:text-sm font-bold outline-none"
                style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

          </div>
        </div>

        {/* Main Canvas Graph Workspace & Interactive Side Drawer */}
        <div
          ref={containerRef}
          className={`relative rounded-3xl overflow-hidden shadow-2xl transition-all ${
            isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-[680px] sm:h-[760px]'
          }`}
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          {/* HTML5 Canvas Element */}
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          />

          {/* Floating Canvas Control Toolbar */}
          <div className="absolute left-4 bottom-4 flex flex-wrap items-center gap-2 p-2 rounded-2xl glass border border-card-border backdrop-blur-md shadow-lg z-20">
            <button
              type="button"
              onClick={zoomIn}
              className="p-2 rounded-xl bg-background-secondary hover:bg-primary-500/20 text-foreground transition-colors"
              title={vi ? 'Phóng to' : 'Zoom In'}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={zoomOut}
              className="p-2 rounded-xl bg-background-secondary hover:bg-primary-500/20 text-foreground transition-colors"
              title={vi ? 'Thu nhỏ' : 'Zoom Out'}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="p-2 rounded-xl bg-background-secondary hover:bg-primary-500/20 text-foreground transition-colors"
              title={vi ? 'Đặt lại camera' : 'Reset Camera'}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-6 bg-card-border mx-1" />

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded-xl text-foreground transition-colors ${
                isPlaying ? 'bg-emerald-500/20 text-emerald-400' : 'bg-background-secondary'
              }`}
              title={isPlaying ? (vi ? 'Tạm dừng vật lý' : 'Pause Physics') : (vi ? 'Chạy vật lý' : 'Run Physics')}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowLabels(!showLabels)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-colors ${
                showLabels ? 'bg-primary-500 text-white' : 'bg-background-secondary text-foreground-muted'
              }`}
            >
              {vi ? 'Tên node' : 'Labels'}
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-xl bg-background-secondary hover:bg-primary-500/20 text-foreground transition-colors ml-1"
              title={vi ? 'Toàn màn hình' : 'Toggle Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Graph Legend Overlay */}
          <div className="absolute right-4 top-4 p-3 rounded-2xl glass border border-card-border backdrop-blur-md text-xs font-medium space-y-2 hidden sm:block z-20">
            <p className="font-black text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
              {vi ? 'Chú thích Node' : 'Node Legend'}
            </p>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-emerald-300" />
              <span className="text-foreground">{vi ? 'Đang xuất bản (Ongoing)' : 'Currently Publishing'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-purple-500 ring-2 ring-purple-300" />
              <span className="text-foreground">{vi ? 'Hoàn thành (Completed)' : 'Completed'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-indigo-600 border-2 border-white flex items-center justify-center text-[8px] font-black text-white">NXB</span>
              <span className="text-foreground">{vi ? 'Nhà xuất bản (Hub)' : 'Publisher Hub'}</span>
            </div>
          </div>

          {/* Hover Tooltip Overlay */}
          {hoveredNode && !selectedNode && (
            <div className="absolute left-6 top-6 pointer-events-none z-30 p-3 rounded-2xl glass border border-card-border shadow-xl max-w-xs animate-fade-in">
              <div className="flex items-center gap-2.5">
                {hoveredNode.coverUrl && (
                  <img src={hoveredNode.coverUrl} alt="" className="w-10 h-14 object-cover rounded-lg shadow-sm" />
                )}
                <div>
                  <p className="text-xs font-black text-foreground line-clamp-1">{hoveredNode.label}</p>
                  {hoveredNode.publisherName && (
                    <p className="text-[11px] font-bold text-primary-400 mt-0.5">
                      {hoveredNode.publisherName}
                    </p>
                  )}
                  {hoveredNode.status && (
                    <span className="inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${getStatusColor(hoveredNode.status)}20`, color: getStatusColor(hoveredNode.status) }}>
                      {hoveredNode.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sliding Side Details Drawer for Selected Node */}
          {selectedNode && (
            <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[380px] glass border-l border-card-border p-5 z-40 overflow-y-auto backdrop-blur-xl animate-slide-left flex flex-col justify-between shadow-2xl">
              <div>
                {/* Header & Close */}
                <div className="flex items-start justify-between gap-3 border-b pb-4 mb-4" style={{ borderColor: 'var(--card-border)' }}>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary-500/10 text-primary-400 border border-primary-500/20">
                      {selectedNode.type === 'publisher' ? (vi ? 'Nhà xuất bản' : 'Publisher Hub') : (vi ? 'Chi tiết Light Novel' : 'Light Novel Details')}
                    </span>
                    <h3 className="text-lg font-black text-foreground mt-1.5 leading-snug">
                      {selectedNode.label}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedNode(null)}
                    className="p-1.5 rounded-xl bg-background-secondary text-foreground-muted hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Cover Image & Metadata for Series Node */}
                {selectedNode.type === 'series' && selectedNode.rawItem && (
                  <div className="space-y-4">
                    {/* Cover Thumbnail */}
                    <div className="flex gap-4 items-center">
                      <div className="w-24 h-36 rounded-2xl overflow-hidden shadow-lg border border-card-border shrink-0 bg-background-secondary">
                        {selectedNode.coverUrl ? (
                          <img src={selectedNode.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-foreground-muted">LN</div>
                        )}
                      </div>

                      <div className="space-y-2 min-w-0">
                        {selectedNode.rawItem.title_vi && (
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted">{vi ? 'Tên tiếng Việt:' : 'Vietnamese Title:'}</p>
                            <p className="text-xs font-bold text-foreground line-clamp-2">{selectedNode.rawItem.title_vi}</p>
                          </div>
                        )}

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted">{vi ? 'Nhà xuất bản:' : 'Publisher:'}</p>
                          <p className="text-xs font-black text-emerald-400">{selectedNode.publisherName}</p>
                        </div>

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted">{vi ? 'Trạng thái phát hành:' : 'Status:'}</p>
                          <span className="inline-block text-xs font-black px-2.5 py-0.5 rounded-full mt-0.5" style={{ background: `${getStatusColor(selectedNode.status || '')}20`, color: getStatusColor(selectedNode.status || '') }}>
                            {selectedNode.status || 'Chưa rõ'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stats Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="rounded-xl p-3 bg-background-secondary border border-card-border">
                        <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted">{vi ? 'Số tập VN' : 'VN Volumes'}</p>
                        <p className="text-base font-black text-amber-400 mt-0.5">
                          {selectedNode.rawItem.number_of_volumes ? `${selectedNode.rawItem.number_of_volumes} tập` : 'Chưa rõ'}
                        </p>
                      </div>

                      <div className="rounded-xl p-3 bg-background-secondary border border-card-border">
                        <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted">{vi ? 'Điểm LN Score' : 'LN Score'}</p>
                        <p className="text-base font-black text-cyan-400 mt-0.5">
                          {selectedNode.rawItem.ln_score ? `${selectedNode.rawItem.ln_score.toFixed(1)} pts` : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Genres List */}
                    {Array.isArray(selectedNode.rawItem.genres) && selectedNode.rawItem.genres.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted mb-1.5">{vi ? 'Thể loại:' : 'Genres:'}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedNode.rawItem.genres.map((g, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary-500/10 text-primary-400 border border-primary-500/20">
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Content for Publisher Node */}
                {selectedNode.type === 'publisher' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl p-4 bg-background-secondary border border-card-border">
                      <p className="text-xs font-bold text-foreground-secondary">{vi ? 'Nhà xuất bản chính thức' : 'Official VN Publisher'}</p>
                      <p className="text-xl font-black text-emerald-400 mt-1">{selectedNode.label}</p>
                      <p className="text-xs text-foreground-muted mt-2">
                        {vi ? `Đã kết nối với ${selectedNode.degree} tựa sách trong hệ thống.` : `Connected with ${selectedNode.degree} titles.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer CTA Link to Content Detail Page */}
              {selectedNode.type === 'series' && selectedNode.rawItem?.lidex_series_id && (
                <div className="pt-4 border-t border-card-border">
                  <Link
                    href={`/content/${selectedNode.rawItem.lidex_series_id}`}
                    className="w-full py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {vi ? 'Xem chi tiết tác phẩm' : 'Open Series Page'}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
