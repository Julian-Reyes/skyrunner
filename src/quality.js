import * as THREE from 'three'
import { SMAAPreset } from 'postprocessing'

// Graphics quality levels. The player picks one on the title screen (or leaves
// it on Auto); App.jsx turns the active level into renderer settings.
//   maxDpr     – cap on device pixel ratio (the biggest GPU cost by far)
//   shadowMap  – sun shadow map size in texels
//   shadowType – per-pixel shadow filtering (Basic = 1 lookup, PCFSoft = ~18)
//   smaa       – anti-aliasing search quality
export const QUALITY_LEVELS = {
  low: { label: 'Low', maxDpr: 1, shadowMap: 2048, shadowType: THREE.BasicShadowMap, smaa: SMAAPreset.LOW },
  medium: { label: 'Medium', maxDpr: 1.25, shadowMap: 2048, shadowType: THREE.PCFSoftShadowMap, smaa: SMAAPreset.MEDIUM },
  high: { label: 'High', maxDpr: 2, shadowMap: 4096, shadowType: THREE.PCFSoftShadowMap, smaa: SMAAPreset.HIGH },
}

// 'auto' starts at medium and drops to low if the frame rate stays under ~50 fps.
// It never moves up to high on its own.
export const QUALITY_CHOICES = ['auto', 'low', 'medium', 'high']
export const AUTO_START = 'medium'
export const AUTO_FALLBACK = 'low'

const KEY = 'ceu-do-rio-quality'

export function loadQuality() {
  try {
    const v = localStorage.getItem(KEY)
    if (QUALITY_CHOICES.includes(v)) return v
  } catch (e) {}
  return 'auto'
}

export function saveQuality(choice) {
  try {
    localStorage.setItem(KEY, choice)
  } catch (e) {}
}
