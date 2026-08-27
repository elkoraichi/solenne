import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DOSSIER_TELEVERSEMENTS } from '@/server/stockage/normalisation'

/** Une vraie image : un JPEG écrit à la main finit toujours par être invalide. */
async function imageJpeg(): Promise<File> {
  const contenu = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 180, g: 140, b: 100 } },
  })
    .jpeg()
    .toBuffer()
  return new File([new Uint8Array(contenu)], 'photo.jpg', { type: 'image/jpeg' })
}

describe('DEPLOY — stockage des images, disque local (contexte Netlify absent)', () => {
  afterEach(async () => {
    vi.resetModules()
    await rm(DOSSIER_TELEVERSEMENTS, { recursive: true, force: true })
  })

  it('écrit sur disque, sert et efface la même image', async () => {
    const { stockerPhoto, lireImage, supprimerImage } = await import(
      '@/server/stockage/images'
    )

    const { url, octets } = await stockerPhoto(await imageJpeg())
    expect(url).toMatch(/^\/media\/[\w-]+\.webp$/)
    expect(octets).toBeGreaterThan(0)

    const nom = url.slice('/media/'.length)
    const surDisque = await readFile(join(DOSSIER_TELEVERSEMENTS, nom))
    expect(surDisque.byteLength).toBe(octets)

    const lue = await lireImage(nom)
    expect(lue?.byteLength).toBe(octets)

    await supprimerImage(url)
    await expect(readFile(join(DOSSIER_TELEVERSEMENTS, nom))).rejects.toThrow()
  })
})

describe('DEPLOY — stockage des images, Netlify Blobs (contexte disponible)', () => {
  afterEach(() => {
    vi.doUnmock('@netlify/blobs')
    vi.resetModules()
  })

  it('range, sert et efface via le magasin distant plutôt que le disque', async () => {
    const magasin = new Map<string, Buffer>()
    const store = {
      set: vi.fn(async (nom: string, valeur: ArrayBuffer) => {
        magasin.set(nom, Buffer.from(valeur))
      }),
      get: vi.fn(async (nom: string) => {
        const valeur = magasin.get(nom)
        if (!valeur) return null
        return valeur.buffer.slice(valeur.byteOffset, valeur.byteOffset + valeur.byteLength)
      }),
      delete: vi.fn(async (nom: string) => {
        magasin.delete(nom)
      }),
    }
    vi.doMock('@netlify/blobs', () => ({ getStore: () => store }))

    const { stockerPhoto, lireImage, supprimerImage } = await import(
      '@/server/stockage/images'
    )

    const { url, octets } = await stockerPhoto(await imageJpeg())
    expect(store.set).toHaveBeenCalledOnce()
    const nom = url.slice('/media/'.length)

    const chemin = join(DOSSIER_TELEVERSEMENTS, nom)
    await expect(readFile(chemin)).rejects.toThrow()

    const lue = await lireImage(nom)
    expect(lue?.byteLength).toBe(octets)
    expect(store.get).toHaveBeenCalledWith(nom, { type: 'arrayBuffer' })

    await supprimerImage(url)
    expect(store.delete).toHaveBeenCalledWith(nom)
    expect(magasin.has(nom)).toBe(false)
  })
})
