import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Sprite = {
  id: number
  img: string
  left: number
  top: number
  duration: number
  size: number
  driftX: number
  driftY: number
}

type WorksheetState = {
  customColor: string
  colorWhy: string
  ort: string
  ortText: string
  grenztText: string
  grenztCanvas: string | null
  drawColor: string
  saetze: Record<string, string>
  stimmenRatsuchende: string
  stimmenIch: string
  macht: string[]
  machtText: string
  manifest: Record<string, string>
  bewusst: string
}

const STORAGE_KEY = 'ki_adb_arbeitsblatt_v1'
const assetBase = import.meta.env.BASE_URL
const imageSources = Array.from({ length: 12 }, (_, idx) => `${assetBase}${idx + 1}.png`)

const ortOptions = [
  'völlig irrelevant',
  'theoretisch interessant',
  'potenziell hilfreich',
  'praktisch notwendig',
  'unvermeidlich',
  'beängstigend dominant',
]

const machtOptions = [
  'KI verstärkt Diskriminierung',
  'KI verschiebt Verantwortung',
  'KI macht Beratung zugänglicher',
  'KI reproduziert gesellschaftliche Normen',
  'KI entlastet, ohne neutral zu sein',
  'KI zwingt mich, Position zu beziehen',
]

const initialState: WorksheetState = {
  customColor: '#0f6dff',
  colorWhy: '',
  ort: '',
  ortText: '',
  grenztText: '',
  grenztCanvas: null,
  drawColor: '#0f172a',
  saetze: {
    saetze1: '',
    saetze2: '',
    saetze3: '',
    saetze4: '',
    saetze5: '',
    saetze6: '',
  },
  stimmenRatsuchende: '',
  stimmenIch: '',
  macht: [],
  machtText: '',
  manifest: {
    manifest1: '',
    manifest2: '',
    manifest3: '',
  },
  bewusst: '',
}

function App() {
  // Audio reactive circle
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const rafRef = useRef<number | null>(null)
  const [audioUrl] = useState<string>(`${assetBase}essay.mp3`)
  const [intensity, setIntensity] = useState(0)
  const [sprites, setSprites] = useState<Sprite[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [animationPaused, setAnimationPaused] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Worksheet state
  const [state, setState] = useState<WorksheetState>(initialState)
  const saveTimer = useRef<number | null>(null)
  const colorInputRef = useRef<HTMLInputElement | null>(null)
  const palette = ['#0f6dff', '#d90429', '#2ba84a', '#f2c94c', '#7e3ff2', '#0f172a', '#f5f5f5']
  const drawPalette = ['#0f172a', '#0f6dff', '#22c55e', '#f59e0b', '#e11d48', '#111827', '#ffffff']
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const scaleRef = useRef<HTMLDivElement | null>(null)

  const getCanvasPos = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    }
  }

  const circleSize = useMemo(() => (window.innerWidth < 768 ? 80 : 70), [])

  // ---- Audio / Circle ----
  const ensureAnalyser = async () => {
    if (!audioRef.current) return
    if (!audioContextRef.current) {
      const ctx = new AudioContext()
      const src = ctx.createMediaElementSource(audioRef.current)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      analyser.connect(ctx.destination)
      audioContextRef.current = ctx
      analyserRef.current = analyser
      dataArrayRef.current = new Uint8Array<ArrayBuffer>(
        new ArrayBuffer(analyser.frequencyBinCount)
      )
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }
  }
  const startLoop = () => {
    if (rafRef.current) return
    const tick = () => {
      if (analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteTimeDomainData(dataArrayRef.current)
        let sumSquares = 0
        for (let i = 0; i < dataArrayRef.current.length; i++) {
          const v = (dataArrayRef.current[i] - 128) / 128
          sumSquares += v * v
        }
        const rms = Math.sqrt(sumSquares / dataArrayRef.current.length)
        const boosted = Math.pow(rms * 12, 1.2)
        const level = Math.min(1, boosted)
        setIntensity((prev) => prev * 0.82 + level * 0.18)
      } else {
        setIntensity(0)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const stopLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setIntensity(0)
  }

  useEffect(() => {
    const spawnInterval = setInterval(() => {
      const now = performance.now()
      setSprites((prev) => {
        const active = prev.filter((sprite) => now - sprite.id < sprite.duration * 1000)
        if (!isPlaying || animationPaused) return active
        const maxSprites = 5
        if (active.length >= maxSprites) return active

        const additions: Sprite[] = []
        const newCount = Math.min(maxSprites - active.length, 1 + Math.floor(Math.random() * 2))
        for (let i = 0; i < newCount; i++) {
          const duration = 38 + Math.random() * 16
          const side = Math.floor(Math.random() * 4)
          let startX = -10
          let startY = 50
          let driftX = 0
          let driftY = 0

          if (side === 0) {
            startY = Math.random() * 60 + 20
            driftX = 180 + Math.random() * 15
            driftY = Math.random() * 30 - 15
          } else if (side === 1) {
            startX = 120
            startY = Math.random() * 60 + 20
            driftX = -180 - Math.random() * 15
            driftY = Math.random() * 30 - 15
          } else if (side === 2) {
            startX = Math.random() * 60 + 20
            startY = -20
            driftX = Math.random() * 30 - 15
            driftY = 180 + Math.random() * 15
          } else {
            startX = Math.random() * 60 + 20
            startY = 120
            driftX = Math.random() * 30 - 15
            driftY = -180 - Math.random() * 15
          }

          additions.push({
            id: performance.now() + i,
            img: imageSources[Math.floor(Math.random() * imageSources.length)],
            left: startX,
            top: startY,
            duration,
            size: Math.random() * 36 + 40,
            driftX,
            driftY,
          })
        }
        return [...active, ...additions]
      })
    }, 1400)

    return () => clearInterval(spawnInterval)
  }, [isPlaying, animationPaused])

  useEffect(() => {
    const prune = setInterval(() => {
      const now = performance.now()
      setSprites((prev) => prev.filter((sprite) => now - sprite.id < sprite.duration * 1000))
    }, 3000)
    return () => clearInterval(prune)
  }, [])

  useEffect(() => {
    if (isPlaying && !animationPaused) {
      ensureAnalyser()
      startLoop()
    } else {
      stopLoop()
    }
  }, [isPlaying, animationPaused])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      analyserRef.current?.disconnect()
      audioContextRef.current?.close()
    },
    []
  )

  const handlePlay = () => {
    setIsPlaying(true)
    setAnimationPaused(false)
    ensureAnalyser()
    startLoop()
  }

  const handlePause = () => {
    setIsPlaying(false)
    setAnimationPaused(true)
    stopLoop()
  }

  const togglePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      handlePause()
    } else {
      audioRef.current.play()
    }
  }

  const circleShadow = useMemo(() => {
    const outer = 18 + intensity * 110
    const glow = 55 + intensity * 200
    return {
      ['--circle-size' as string]: `${circleSize}vmin`,
      boxShadow: `0 0 ${outer}px rgba(15, 109, 255, ${0.55 + intensity * 0.45}), 0 0 ${glow}px rgba(15, 109, 255, ${0.34 + intensity * 0.45})`,
    }
  }, [circleSize, intensity])

  // ---- Worksheet state management ----
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as WorksheetState
        setState({ ...initialState, ...parsed })
      } catch {
        setState(initialState)
      }
    }
  }, [])

  const queueSave = (next: WorksheetState) => {
    setState(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }, 400)
  }

  const handleFieldChange = (key: keyof WorksheetState, value: WorksheetState[typeof key]) => {
    queueSave({ ...state, [key]: value })
  }

  const handleSaetzeChange = (key: string, value: string) => {
    queueSave({ ...state, saetze: { ...state.saetze, [key]: value } })
  }

  const handleManifestChange = (key: string, value: string) => {
    queueSave({ ...state, manifest: { ...state.manifest, [key]: value } })
  }

  const handleMachtToggle = (item: string) => {
    const current = state.macht
    const exists = current.includes(item)
    let next = current
    if (exists) {
      next = current.filter((v) => v !== item)
    } else if (current.length < 3) {
      next = [...current, item]
    }
    queueSave({ ...state, macht: next })
  }

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2
    ctx.strokeStyle = state.drawColor
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (state.grenztCanvas) {
      const img = new Image()
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
      }
      img.src = state.grenztCanvas
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [state.grenztCanvas, state.drawColor])

  const saveCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const data = canvas.toDataURL('image/png')
    queueSave({ ...state, grenztCanvas: data })
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    lastPoint.current = getCanvasPos(e)
    drawing.current = true
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx || !lastPoint.current) return
    ctx.strokeStyle = state.drawColor
    const { x, y } = getCanvasPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(x, y)
    ctx.stroke()
    lastPoint.current = { x, y }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    if (canvasRef.current) {
      canvasRef.current.releasePointerCapture(e.pointerId)
      saveCanvas()
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    queueSave({ ...state, grenztCanvas: null })
  }

  const handleScaleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = scaleRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    const idx = Math.round(ratio * (ortOptions.length - 1))
    handleFieldChange('ort', ortOptions[idx] || ortOptions[0])
  }

  // Export & screenshot
  const exportImage = async () => {
    const node = sheetRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const clone = node.cloneNode(true) as HTMLElement
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
    clone.style.margin = '0'
    clone.style.background = '#f7fbff'

    const copyStyles = (source: Element, target: Element) => {
      const computed = window.getComputedStyle(source)
      const style: Record<string, string> = {}
      for (let i = 0; i < computed.length; i++) {
        const prop = computed.item(i)
        if (!prop) continue
        style[prop] = computed.getPropertyValue(prop)
      }
      const styleString = Object.entries(style)
        .map(([k, v]) => `${k}:${v};`)
        .join('')
      target.setAttribute('style', styleString)

      const sourceChildren = Array.from(source.children)
      const targetChildren = Array.from(target.children)
      for (let i = 0; i < sourceChildren.length; i++) {
        copyStyles(sourceChildren[i], targetChildren[i])
      }
    }

    copyStyles(node, clone)

    const styleTags = Array.from(document.querySelectorAll('style'))
      .map((s) => s.innerHTML)
      .join('\n')

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
        <rect width="100%" height="100%" fill="#f7fbff" />
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">
            <style>${styleTags}</style>
            ${new XMLSerializer().serializeToString(clone)}
          </div>
        </foreignObject>
      </svg>`
    const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = rect.width * 2
      canvas.height = rect.height * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#f7fbff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'arbeitsblatt.png'
        a.click()
        URL.revokeObjectURL(url)
      })
    }
    img.onerror = () => alert('Screenshot nicht möglich in diesem Browser.')
    img.src = encoded
  }

  const resetAll = () => {
    const ok = window.confirm('Alles zurücksetzen? Lokale Antworten werden gelöscht.')
    if (!ok) return
    queueSave(initialState)
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  return (
    <div className="page worksheet">
      <div className="top">
        <div className="circle-wrap">
          <button
            className="animation-toggle floating"
            type="button"
            onClick={() => setAnimationPaused((prev) => !prev)}
          >
            {animationPaused ? 'Animation an' : 'Animation aus'}
          </button>
          <div className="circle" style={circleShadow}>
            <div className="halo" />
            <button className="play-overlay" type="button" onClick={togglePlayPause}>
              {isPlaying ? '❚❚' : '▶'}
            </button>
            {sprites.map((sprite) => (
              <div
                key={sprite.id}
                className="sprite"
                style={
                  {
                    left: `${sprite.left}%`,
                    top: `${sprite.top}%`,
                    width: `${sprite.size}vmin`,
                    animationDuration: `${sprite.duration}s`,
                    ['--drift-x' as string]: `${sprite.driftX}%`,
                    ['--drift-y' as string]: `${sprite.driftY}%`,
                    animationPlayState: !isPlaying || animationPaused ? 'paused' : 'running',
                  } as React.CSSProperties
                }
              >
                <img
                  src={sprite.img}
                  alt=""
                  style={{
                    animationPlayState: !isPlaying || animationPaused ? 'paused' : 'running',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        <audio
          ref={audioRef}
          controls
          src={audioUrl}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handlePause}
          className="audio"
        />
      </div>

      <div className="sheet" ref={sheetRef}>
        <header className="intro">
          <div>
            <button type="button" className="sheet-toggle" onClick={() => setSheetOpen((v) => !v)}>
              {sheetOpen ? 'Reflexionsraum schließen' : 'Reflexionsraum öffnen (nach dem Essay)'}
            </button>
            {sheetOpen && (
              <>
                <p className="eyebrow">Nach dem Essay</p>
                <h1>Dein Reflexionsraum</h1>
                <p className="lede">
                  Zum Ordnen deiner eigenen Gedanken. Keine Bewertung, kein Export nach außen. Alles bleibt lokal.
                </p>
              </>
            )}
          </div>
          <div className="actions">
            {sheetOpen && (
              <>
                <button type="button" onClick={resetAll}>
                  Alles zurücksetzen
                </button>
                <span className="badge">Lokal gespeichert</span>
              </>
            )}
          </div>
        </header>

        <div className={`sheet-body ${sheetOpen ? 'open' : 'closed'}`}>
        <section className="card">
          <div className="card-title">Welche Farbe hat KI für dich?</div>
          <div className="row">
            <div className="col">
              <div className="swatch-row">
                <button
                  type="button"
                  className="swatch swatch-weird"
                  style={{ background: state.customColor }}
                  aria-label="Gewählte Farbe"
                  onClick={() => colorInputRef.current?.click()}
                />
                <div className="color-meta">
                  <div className="code-label">Hex</div>
                  <div className="code-value">{state.customColor}</div>
                  <div className="palette">
                    {palette.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="palette-swatch"
                        style={{ background: c }}
                        aria-label={`Farbe ${c}`}
                        onClick={() => handleFieldChange('customColor', c)}
                      />
                    ))}
                  </div>
                  <div className="picker-row">
                    <span className="code-label">Oder eigene Farbe:</span>
                    <input
                      ref={colorInputRef}
                      type="color"
                      value={state.customColor}
                      onChange={(e) => handleFieldChange('customColor', e.target.value)}
                      className="color-visible"
                      aria-label="Eigene Farbe wählen"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="col">
              <label className="field">
                Warum diese Farbe?
                <textarea
                  value={state.colorWhy}
                  onChange={(e) => handleFieldChange('colorWhy', e.target.value)}
                  ref={autoGrow}
                  onInput={(e) => autoGrow(e.currentTarget)}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Wo siehst du KI gerade in deinem Leben?</div>
          <div className="row">
            <div className="col">
              <div className="scale-new" ref={scaleRef} onClick={handleScaleClick}>
                <div className="scale-track" />
                <input
                  type="range"
                  min={0}
                  max={ortOptions.length - 1}
                  step={1}
                  value={Math.max(0, ortOptions.indexOf(state.ort || ''))}
                  onChange={(e) => handleFieldChange('ort', ortOptions[Number(e.target.value)])}
                  className="scale-slider-vertical"
                />
                <div className="scale-handle-wrapper vertical">
                  <div
                    className="scale-handle"
                    style={{
                      top: `${
                        ((ortOptions.indexOf(state.ort || '') >= 0
                          ? ortOptions.indexOf(state.ort || '')
                          : 0) /
                          (ortOptions.length - 1)) *
                        100
                      }%`,
                    }}
                  >
                    <span className="arrow">▶</span>
                  </div>
                </div>
                <div className="scale-stops-col">
                  {ortOptions.map((o, idx) => {
                    const pos = (idx / (ortOptions.length - 1)) * 100
                    return (
                      <button
                        key={o}
                        className={`stop ${state.ort === o ? 'active' : ''}`}
                        type="button"
                        onClick={() => handleFieldChange('ort', o)}
                        style={{ top: `${pos}%` }}
                      >
                        <span className="stop-line" />
                        <span className="stop-label">{o}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="col">
              <label className="field">
                Wo würdest du gern stehen – und was hält dich davon ab?
                <textarea
                  value={state.ortText}
                  onChange={(e) => handleFieldChange('ortText', e.target.value)}
                  ref={autoGrow}
                  onInput={(e) => autoGrow(e.currentTarget)}
                  rows={6}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Grenze</div>
          <div className="row">
            <div className="col draw">
              <div className="canvas-controls">
                <div className="canvas-legend">
                  <span>Zeichne: einen Menschen, eine KI, eine Grenze.</span>
                  <div className="draw-palette">
                    {drawPalette.map((c) => (
                      <button
                        key={c}
                        className={`draw-swatch ${state.drawColor === c ? 'active' : ''}`}
                        style={{ background: c }}
                        onClick={() => queueSave({ ...state, drawColor: c })}
                        aria-label={`Zeichenfarbe ${c}`}
                      />
                    ))}
                  </div>
                </div>
                <button type="button" onClick={clearCanvas}>
                  Löschen
                </button>
              </div>
              <canvas
                ref={canvasRef}
                width={640}
                height={360}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
            </div>
            <div className="col">
              <label className="field">
                Ein Satz zur Zeichnung.
                <textarea
                  value={state.grenztText}
                  onChange={(e) => handleFieldChange('grenztText', e.target.value)}
                  ref={autoGrow}
                  onInput={(e) => autoGrow(e.currentTarget)}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Sätze</div>
          <div className="grid two">
            <label className="field">
              KI in der Antidiskriminierungsberatung ist für mich …
              <textarea
                value={state.saetze.saetze1}
                onChange={(e) => handleSaetzeChange('saetze1', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
            <label className="field">
              Ich vertraue KI, wenn …
              <textarea
                value={state.saetze.saetze2}
                onChange={(e) => handleSaetzeChange('saetze2', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
            <label className="field">
              Ich misstraue KI, weil …
              <textarea
                value={state.saetze.saetze3}
                onChange={(e) => handleSaetzeChange('saetze3', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
            <label className="field">
              KI wird problematisch, sobald …
              <textarea
                value={state.saetze.saetze4}
                onChange={(e) => handleSaetzeChange('saetze4', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
            <label className="field">
              Ich wünsche mir von KI …
              <textarea
                value={state.saetze.saetze5}
                onChange={(e) => handleSaetzeChange('saetze5', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
            <label className="field">
              Ich wünsche mir nicht von KI …
              <textarea
                value={state.saetze.saetze6}
                onChange={(e) => handleSaetzeChange('saetze6', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Stimmen</div>
          <div className="grid two">
            <label className="field">
              Ratsuchende Person: „Wenn KI in der Beratung eingesetzt wird, fühle ich …“
              <textarea
                value={state.stimmenRatsuchende}
                onChange={(e) => handleFieldChange('stimmenRatsuchende', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
            <label className="field">
              Ich: „Was ich an KI schwer aushalte, ist …“
              <textarea
                value={state.stimmenIch}
                onChange={(e) => handleFieldChange('stimmenIch', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Macht</div>
          <div className="pill-grid tight">
            {machtOptions.map((m) => (
              <button
                key={m}
                type="button"
                className={`pill ${state.macht.includes(m) ? 'active' : ''}`}
                onClick={() => handleMachtToggle(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <small className="hint-text">Maximal drei auswählen.</small>
          <label className="field">
            Was davon beschäftigt dich am meisten?
            <textarea
              value={state.machtText}
              onChange={(e) => handleFieldChange('machtText', e.target.value)}
              ref={autoGrow}
              onInput={(e) => autoGrow(e.currentTarget)}
            />
          </label>
        </section>

        <section className="card">
          <div className="card-title">Ich</div>
          <div className="grid three">
            <label className="field">
              Ich nutze KI, weil …
              <textarea
                value={state.manifest.manifest1}
                onChange={(e) => handleManifestChange('manifest1', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
            <label className="field">
              Ich nutze KI nicht, wenn …
              <textarea
                value={state.manifest.manifest2}
                onChange={(e) => handleManifestChange('manifest2', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
            <label className="field">
              Ich übernehme Verantwortung für …
              <textarea
                value={state.manifest.manifest3}
                onChange={(e) => handleManifestChange('manifest3', e.target.value)}
                ref={autoGrow}
                onInput={(e) => autoGrow(e.currentTarget)}
              />
            </label>
          </div>
        </section>

        <section className="card">
          <div className="card-title">…</div>
          <label className="field">
            Was möchte ich im Umgang mit KI bewusster machen – nicht effizienter?
            <textarea
              value={state.bewusst}
              onChange={(e) => handleFieldChange('bewusst', e.target.value)}
              ref={autoGrow}
              onInput={(e) => autoGrow(e.currentTarget)}
              rows={4}
            />
          </label>
          <label className="field">
            Was möchte ich nach dem Workshop in meine Arbeit / zum Träger mitnehmen?
            <textarea
              value={state.manifest.manifest3}
              onChange={(e) => handleManifestChange('manifest3', e.target.value)}
              ref={autoGrow}
              onInput={(e) => autoGrow(e.currentTarget)}
              rows={3}
            />
          </label>
        </section>
        <div className="footer-actions">
          <button type="button" onClick={exportImage}>
            Screenshot speichern
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}

export default App
