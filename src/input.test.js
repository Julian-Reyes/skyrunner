import test from 'node:test'
import assert from 'node:assert/strict'
import { stickAxes, touchInput, resetTouchInput } from './input.js'

test('stick directions match keyboard controls at 70% strength at the edge', () => {
  assert.equal(stickAxes(0, 50, 50).pitch, 0.7)
  assert.equal(stickAxes(0, -50, 50).pitch, -0.7)
  assert.equal(stickAxes(-50, 0, 50).roll, 0.7)
  assert.equal(stickAxes(50, 0, 50).roll, -0.7)
})

test('stick ignores small movements and softens steering near the centre', () => {
  const centered = stickAxes(0, 0, 50)
  assert.equal(centered.pitch, 0)
  assert.equal(centered.roll, 0)
  assert.equal(stickAxes(0, 5, 50).pitch, 0)
  assert.equal(stickAxes(0, 8, 50).pitch, 0)
  assert.ok(Math.abs(stickAxes(0, 29, 50).pitch - 0.7 * 0.5 ** 1.5) < 1e-10)
  assert.ok(stickAxes(0, 29, 50).pitch < 0.5)
  assert.ok(stickAxes(0, 40, 50).pitch > stickAxes(0, 29, 50).pitch)
})

test('dragging beyond the stick caps steering at 70% while the knob reaches the edge', () => {
  const axes = stickAxes(300, -400, 50)
  assert.ok(Math.abs(Math.hypot(axes.pitch, axes.roll) - 0.7) < 1e-10)
  assert.ok(Math.abs(Math.hypot(axes.x, axes.y) - 50) < 1e-10)
})

test('steering and hold actions remain independent and reset together', () => {
  Object.assign(touchInput, { pitch: 0.4, roll: -0.5, boost: true, brake: true })
  touchInput.boost = false
  assert.equal(touchInput.pitch, 0.4)
  assert.equal(touchInput.roll, -0.5)
  assert.equal(touchInput.brake, true)
  resetTouchInput()
  assert.deepEqual(touchInput, { pitch: 0, roll: 0, boost: false, brake: false })
})
