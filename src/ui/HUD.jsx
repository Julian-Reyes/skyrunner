import { useEffect, useRef, useState } from 'react'
import { game, startGame, keys } from '../game.js'
import { heightAt, favelaAt } from '../world/terrain.js'
import { initAudio } from '../audio.js'

const fmt = (t) => {
  if (t == null) return '--:--.-'
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

// ---------- minimap ----------------------------------------------------------
const MM = 180
const VIEW = 5200 // metres shown across the minimap
const OX = 0, OZ = -300
function bakeMinimap() {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(N, N)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = OX + (i / N - 0.5) * VIEW
      const z = OZ + (j / N - 0.5) * VIEW
      const h = heightAt(x, z)
      let r, g, b
      if (h < 0) { const k = Math.min(1, -h / 30); r = 40 - 20 * k; g = 150 - 60 * k; b = 170 - 30 * k }
      else if (h < 4) { r = 236; g = 214; b = 162 }
      else if (favelaAt(x, z)) { r = 190; g = 110; b = 70 }
      else if (h < 22) { r = 160; g = 154; b = 142 }
      else { const k = Math.min(1, h / 800); r = 60 + 120 * k; g = 105 + 90 * k; b = 55 + 110 * k }
      const o = (j * N + i) * 4
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 235
    }
  ctx.putImageData(img, 0, 0)
  return c
}

function Minimap() {
  const ref = useRef()
  useEffect(() => {
    const bg = bakeMinimap()
    const ctx = ref.current.getContext('2d')
    let raf
    const toPx = (x, z) => [((x - OX) / VIEW + 0.5) * MM, ((z - OZ) / VIEW + 0.5) * MM]
    const draw = () => {
      ctx.clearRect(0, 0, MM, MM)
      ctx.save()
      ctx.beginPath()
      ctx.arc(MM / 2, MM / 2, MM / 2 - 1, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(bg, 0, 0, MM, MM)
      if (game.mode === 'tour' && game.phase !== 'title') {
        game.course.forEach((r, i) => {
          if (i < game.ringIndex) return
          const [px, py] = toPx(r.pos.x, r.pos.z)
          ctx.fillStyle = i === game.ringIndex ? '#fff27a' : 'rgba(255,170,60,0.8)'
          ctx.beginPath()
          ctx.arc(px, py, i === game.ringIndex ? 4.5 : 2.5, 0, Math.PI * 2)
          ctx.fill()
        })
      }
      if (game.phase !== 'title') {
        const [px, py] = toPx(game.pos.x, game.pos.z)
        // heading from quaternion (forward = -Z)
        const q = game.quat
        const fx = -(2 * (q.x * q.z + q.w * q.y))
        const fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
        const a = Math.atan2(fz, fx)
        ctx.translate(px, py)
        ctx.rotate(a + Math.PI / 2)
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = '#0b2540'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, -7)
        ctx.lineTo(5, 6)
        ctx.lineTo(0, 3)
        ctx.lineTo(-5, 6)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="minimap">
      <canvas ref={ref} width={MM} height={MM} />
      <span className="n">N</span>
    </div>
  )
}

// ---------- HUD --------------------------------------------------------------
export default function HUD() {
  const [, setTick] = useState(0)
  const flashRef = useRef()
  const lastLandmark = useRef('')
  const [landmark, setLandmark] = useState({ name: '', key: 0 })

  useEffect(() => {
    let raf
    let acc = 0
    let last = performance.now()
    const loop = (now) => {
      const dt = (now - last) / 1000
      last = now
      game.messageT = Math.max(0, game.messageT - dt)
      game.flash = Math.max(0, game.flash - dt * 1.5)
      game.ringFlash = Math.max(0, game.ringFlash - dt * 3)
      if (flashRef.current) {
        flashRef.current.style.opacity = Math.max(game.flash * 0.9, game.ringFlash * 0.25)
        flashRef.current.style.background = game.flash > game.ringFlash ? '#fff4e0' : '#fff27a'
      }
      if (game.landmark !== lastLandmark.current) {
        lastLandmark.current = game.landmark
        if (game.landmark) setLandmark((l) => ({ name: game.landmark, key: l.key + 1 }))
      }
      acc += dt
      if (acc > 0.08) {
        acc = 0
        setTick((t) => t + 1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyM') game.muted = !game.muted
      if (e.code === 'KeyI') {
        game.invert = !game.invert
        game.message = game.invert ? 'Pitch inverted (W = nose up)' : 'Pitch normal (S = nose up)'
        game.messageT = 1.5
      }
      if (e.code === 'KeyR' && game.phase !== 'title') startGame(game.mode)
      if (e.code === 'Escape') game.phase = 'title'
      if (game.phase === 'title' && e.code === 'Enter') begin('tour')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const begin = (mode) => {
    initAudio()
    keys.clear()
    startGame(mode)
  }

  const g = game
  const flying = g.phase !== 'title'
  const total = g.course.length

  return (
    <div className="hud">
      <div ref={flashRef} className="flash" />

      {g.phase === 'title' && (
        <div className="title">
          <div className="card">
            <div className="kicker">Rio de Janeiro · golden hour</div>
            <h1>Céu do Rio</h1>
            <p className="sub">A low-poly flight over Pão de Açúcar, the favelas on the hills, and the beaches of Leblon, Ipanema and Copacabana.</p>
            <div className="buttons">
              <button className="primary" onClick={() => begin('tour')}>
                Tour do Rio <span>{total} rings · timed</span>
              </button>
              <button onClick={() => begin('free')}>
                Free flight <span>no rings, just fly</span>
              </button>
            </div>
            {g.best != null && <div className="best">Best tour time: {fmt(g.best)}</div>}
            <div className="controls">
              <div><kbd>W</kbd><kbd>S</kbd> pitch (S pulls up)</div>
              <div><kbd>A</kbd><kbd>D</kbd> roll / bank to turn</div>
              <div><kbd>Q</kbd><kbd>E</kbd> rudder</div>
              <div><kbd>Space</kbd> boost · <kbd>C</kbd> air brake</div>
              <div><kbd>I</kbd> invert pitch · <kbd>M</kbd> mute · <kbd>R</kbd> restart</div>
            </div>
            <div className="touchnote">This build needs a keyboard. Open it on a laptop or desktop to fly.</div>
          </div>
        </div>
      )}

      {flying && (
        <>
          <div className="topleft">
            {g.mode === 'tour' ? (
              <>
                <div className="big">{fmt(g.time)}</div>
                <div className="small">
                  Ring {Math.min(g.ringIndex + 1, total)} / {total}
                  {g.best != null && <> · best {fmt(g.best)}</>}
                </div>
                {g.ringIndex < total && <div className="next">Next: {g.course[g.ringIndex].name}</div>}
              </>
            ) : (
              <div className="small">Free flight · Esc for menu</div>
            )}
          </div>
          <Minimap />
          <div key={landmark.key} className="landmark">{landmark.name}</div>
          {g.messageT > 0 && <div className="message">{g.message}</div>}
          <div className="gauges">
            <div className="g"><label>Speed</label><b>{Math.round(g.speed * 3.6)}</b><i>km/h</i></div>
            <div className="g"><label>Alt</label><b>{Math.max(0, Math.round(g.pos.y))}</b><i>m</i></div>
            <div className="g boost">
              <label>Boost</label>
              <div className="bar"><div style={{ width: `${g.boost * 100}%` }} className={g.boosting ? 'on' : ''} /></div>
            </div>
          </div>
          {g.agl < 25 && g.phase === 'flying' && <div className="warn">PULL UP</div>}
        </>
      )}

      {g.phase === 'finished' && (
        <div className="finish">
          <div className="card">
            <div className="kicker">Chegada · São Conrado</div>
            <h2>{fmt(g.lastTime)}</h2>
            {g.newBest ? <p className="nb">New best time!</p> : g.best != null && <p>Best: {fmt(g.best)}</p>}
            <p className="hint">Keep flying freely, press <kbd>R</kbd> to race again, or <kbd>Esc</kbd> for the menu.</p>
          </div>
        </div>
      )}
    </div>
  )
}
