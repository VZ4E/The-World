import React, { useRef, useEffect, memo } from 'react'
import Hls from 'hls.js'

const HLS_URL = 'https://stream.mux.com/hUT6X11m1Vkw1QMxPOLgI761x2cfpi9bHFbi5cNg4014.m3u8'

const BackgroundVideo = memo(function BackgroundVideo() {
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls

    if (Hls.isSupported()) {
      hls = new Hls({ autoStartLoad: true, startLevel: -1 })
      hls.loadSource(HLS_URL)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = HLS_URL
      video.play().catch(() => {})
    }

    return () => {
      if (hls) hls.destroy()
    }
  }, [])

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full object-cover -z-10"
      autoPlay
      muted
      loop
      playsInline
    />
  )
})

export default BackgroundVideo
