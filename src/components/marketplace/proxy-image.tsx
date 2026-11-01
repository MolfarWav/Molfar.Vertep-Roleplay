// <img> for proxied remote art (the engine's same-origin image proxy). The Marketplace and Home both use it, so a
// listing's picture takes the same route in both places.

import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { DEFAULT_AVATAR } from '@/lib/utils'
import { proxyUrl } from '@/lib/engine'

/** The proxy route carries the session, which the sandboxed page does not have, so the bytes come through the bridge
 *  fetch (the frame's window.fetch is shimmed) as an object URL. Pointing <img src> straight at the proxy races the
 *  bridge rewriter: the browser fires a cookieless 401 first and Firefox reports a blocked response. */
export function ProxyImage({ url, ...rest }: { url: string | null } & ImgHTMLAttributes<HTMLImageElement>) {
  const [src, setSrc] = useState(DEFAULT_AVATAR)
  useEffect(() => {
    if (!url) { setSrc(DEFAULT_AVATAR); return }
    let dead = false
    let made: string | null = null
    fetch(proxyUrl(url))
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob() })
      .then((b) => { if (dead) return; made = URL.createObjectURL(b); setSrc(made) })
      .catch(() => { if (!dead) setSrc(DEFAULT_AVATAR) })
    return () => { dead = true; if (made) URL.revokeObjectURL(made) }
  }, [url])
  return <img src={src} {...rest} />
}
