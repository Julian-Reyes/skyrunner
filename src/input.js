// Shared analog input; keyboard input stays independent for hybrid devices.
export const touchInput = { pitch: 0, roll: 0, boost: false, brake: false }

export function resetTouchInput() {
  touchInput.pitch = 0
  touchInput.roll = 0
  touchInput.boost = false
  touchInput.brake = false
}

export function stickAxes(dx, dy, radius) {
  const distance = Math.hypot(dx, dy)
  const travel = Math.min(distance / radius, 1)
  // Gentle near the centre; full travel gives 70% of keyboard steering.
  const strength = 0.7 * Math.max(0, (travel - 0.16) / 0.84) ** 1.5
  return {
    // Drag down to pull up, matching S; drag left to bank left.
    pitch: distance ? dy / distance * strength : 0,
    roll: distance ? -dx / distance * strength : 0,
    x: distance ? dx / distance * travel * radius : 0,
    y: distance ? dy / distance * travel * radius : 0,
  }
}
