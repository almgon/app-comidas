import { supabase } from './supabase'

/** Reduce la foto a 1200 px de lado y la sube a Storage. Devuelve la URL pública. */
export async function subirFoto(archivo: File, hogarId: string): Promise<string> {
  const bmp = await createImageBitmap(archivo)
  const escala = Math.min(1, 1200 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob: Blob = await new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.82))
  const ruta = `${hogarId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('fotos').upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl
}
