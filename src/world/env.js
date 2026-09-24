import * as THREE from 'three'

// Golden hour: sun setting in the west behind Dois Irmãos (the classic Arpoador view)
export const SUN_DIR = new THREE.Vector3(-1, 0.2, 0.32).normalize()
export const SUN_COLOR = new THREE.Color('#ffc58a')
export const FOG_COLOR = new THREE.Color('#e9b98f')
export const HORIZON = new THREE.Color('#f2c29a')
export const ZENITH = new THREE.Color('#3f6fb0')
export const FOG_NEAR = 700
export const FOG_FAR = 5200
