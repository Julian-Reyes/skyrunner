import { useEffect, useRef } from 'react'
import { touchInput, resetTouchInput, stickAxes } from '../input.js'

function HoldButton({ action, children }) {
  const pointer = useRef(null)
  const ref = useRef()

  const release = (e) => {
    if (e && 'pointerId' in e && e.pointerId !== pointer.current) return
    pointer.current = null
    touchInput[action] = false
    ref.current?.classList.remove('held')
  }

  useEffect(() => {
    const hidden = () => { if (document.hidden) release() }
    window.addEventListener('blur', release)
    window.addEventListener('resize', release)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('blur', release)
      window.removeEventListener('resize', release)
      document.removeEventListener('visibilitychange', hidden)
      release()
    }
  }, [])

  return (
    <button ref={ref} className={`touch-action ${action}`} aria-label={`Hold to ${action}`}
      onPointerDown={(e) => {
        if (pointer.current !== null || e.button !== 0) return
        e.preventDefault()
        pointer.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        touchInput[action] = true
        e.currentTarget.classList.add('held')
      }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}>
      {children}
    </button>
  )
}

export default function TouchControls() {
  const stick = useRef()
  const knob = useRef()
  const pointer = useRef(null)
  const origin = useRef({ x: 0, y: 0 })

  const release = (e) => {
    if (e && e.pointerId !== pointer.current) return
    pointer.current = null
    touchInput.pitch = touchInput.roll = 0
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)'
    stick.current?.classList.remove('held')
  }

  useEffect(() => {
    const reset = () => { release(); resetTouchInput() }
    const hidden = () => { if (document.hidden) reset() }
    window.addEventListener('blur', reset)
    window.addEventListener('resize', reset)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('blur', reset)
      window.removeEventListener('resize', reset)
      document.removeEventListener('visibilitychange', hidden)
      reset()
    }
  }, [])

  const move = (e) => {
    if (pointer.current !== e.pointerId) return
    const rect = stick.current.getBoundingClientRect()
    const axes = stickAxes(e.clientX - origin.current.x, e.clientY - origin.current.y, rect.width * 0.34)
    touchInput.pitch = axes.pitch
    touchInput.roll = axes.roll
    knob.current.style.transform = `translate(${axes.x}px, ${axes.y}px)`
  }

  return (
    <div className="touch-controls">
      <div className="stick-area">
        <div ref={stick} className="touch-stick" role="group" aria-label="Flight stick: drag down to climb, up to dive, left or right to bank"
          onPointerDown={(e) => {
            if (pointer.current !== null || e.button !== 0) return
            e.preventDefault()
            pointer.current = e.pointerId
            // Start neutral wherever the thumb lands; steer by dragging from there.
            origin.current = { x: e.clientX, y: e.clientY }
            e.currentTarget.setPointerCapture(e.pointerId)
            e.currentTarget.classList.add('held')
            move(e)
          }} onPointerMove={move}
          onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
          onContextMenu={(e) => e.preventDefault()}>
          <div ref={knob} className="stick-knob" />
        </div>
        <span className="stick-hint">↓ climb · ↑ dive · ← → bank</span>
      </div>
      <div className="touch-actions">
        <HoldButton action="boost">Boost</HoldButton>
        <HoldButton action="brake">Brake</HoldButton>
      </div>
    </div>
  )
}
