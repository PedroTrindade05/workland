// Arquivos do visual realista (public/world): céus HDRI, texturas PBR e modelos, todos CC0 (Poly Haven, ambientCG) ou NASA.
import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { pc } from '../pc'

// no app (file://) o fetch não abre arquivo local: passa pelo protocolo wlfile do Workland
export function assetUrl(rel: string) {
  const u = new URL(rel, location.href)
  if (u.protocol !== 'file:') return u.href
  return pc.fileUrl(decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1'))
}

// conjuntos de mapas por material (nomes dos arquivos em public/world/tex)
const SETS = {
  parquet: { map: 'parquet_diff', normalMap: 'parquet_nor_gl', arm: 'parquet_arm' },
  walnut: { map: 'walnut_diff', normalMap: 'walnut_nor_gl', arm: 'walnut_arm' },
  concrete: { map: 'concrete_diff', normalMap: 'concrete_nor_gl', arm: 'concrete_arm' },
  deck: { map: 'deck_Color', normalMap: 'deck_NormalGL', roughnessMap: 'deck_Roughness', metalnessMap: 'deck_Metalness' },
  hull: { map: 'hull_Color', normalMap: 'hull_NormalGL', roughnessMap: 'hull_Roughness', metalnessMap: 'hull_Metalness' },
  solar: { map: 'solar_Color', normalMap: 'solar_NormalGL', roughnessMap: 'solar_Roughness', metalnessMap: 'solar_Metalness' },
  grate: { map: 'grate_Color', normalMap: 'grate_NormalGL', roughnessMap: 'grate_Roughness', metalnessMap: 'grate_Metalness', alphaMap: 'grate_Opacity' },
} as const
export type PbrName = keyof typeof SETS

type Maps = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap?: THREE.Texture; metalnessMap?: THREE.Texture; aoMap?: THREE.Texture; alphaMap?: THREE.Texture }

// mapas com repetição própria (os clones dividem a mesma imagem na GPU)
export function usePbr(name: PbrName, repeat: [number, number], anisotropy = 8): Maps {
  const set = SETS[name] as Record<string, string>
  const keys = Object.keys(set)
  const urls = keys.map((k) => assetUrl(`world/tex/${set[k]}.jpg`))
  const loaded = useLoader(THREE.TextureLoader, urls)
  return useMemo(() => {
    const out: Record<string, THREE.Texture> = {}
    keys.forEach((k, i) => {
      const t = loaded[i].clone()
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(...repeat)
      t.anisotropy = anisotropy
      t.colorSpace = k === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.needsUpdate = true
      out[k] = t
    })
    // ARM do Poly Haven: oclusão (R), rugosidade (G), metal (B) num arquivo só
    if (out.arm) {
      out.aoMap = out.arm
      out.roughnessMap = out.arm
      out.metalnessMap = out.arm
      delete out.arm
    }
    return out as unknown as Maps
  }, [loaded, repeat[0], repeat[1], anisotropy]) // eslint-disable-line react-hooks/exhaustive-deps
}

export const modelUrl = (id: string) => assetUrl(`world/models/${id}/${id}_1k.gltf`)
