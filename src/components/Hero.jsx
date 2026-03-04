import React from 'react'
import { ArrowRight, Play } from 'lucide-react'
import { motion } from 'motion/react'
import BackgroundVideo from './BackgroundVideo'

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
}

const AVATARS = [
  { initials: 'GK', bg: '#4f74f3' },
  { initials: 'JM', bg: '#8b5cf6' },
  { initials: 'RL', bg: '#10b981' },
]

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* HLS background video */}
      <BackgroundVideo />

      {/* Dark tint overlay so text stays readable over any video frame */}
      <div className="absolute inset-0 bg-[#080a0e]/55 -z-10" />

      {/* Bottom fade into page background */}
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-b from-transparent via-transparent to-[#080a0e] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-24 flex flex-col items-center text-center">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center gap-6"
        >
          {/* Badge */}
          <motion.div variants={item}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase border border-[#fb923c]/40 text-[#fb923c] bg-[#fb923c]/10">
              Real-Time Deal Intelligence
            </span>
          </motion.div>

          {/* H1 */}
          <motion.h1
            variants={item}
            className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.05]"
          >
            Know every deal
            <br />
            your competitors sign.
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            variants={item}
            className="text-xl font-medium text-white/70 -mt-2"
          >
            Before they cash the check.
          </motion.p>

          {/* Body text */}
          <motion.p
            variants={item}
            className="text-base text-white/55 max-w-lg leading-relaxed"
          >
            Respawn Signal monitors competitor creators across TikTok, Twitch, and YouTube —
            detecting every sponsored brand deal in real time so your agency can pitch first.
          </motion.p>

          {/* Button row */}
          <motion.div
            variants={item}
            className="flex flex-col sm:flex-row items-center gap-3 mt-2"
          >
            {/* Primary CTA with glow */}
            <div className="relative inline-block group">
              <div className="absolute inset-0 bg-orange-600 blur-xl opacity-25 rounded-xl transition-opacity duration-300 group-hover:opacity-60" />
              <a href="#cta" className="btn-primary group relative">
                Request Early Access
                <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </a>
            </div>

            {/* Secondary CTA */}
            <button className="btn-secondary">
              <Play className="w-4 h-4 fill-current" />
              View Demo
            </button>
          </motion.div>

          {/* Social proof */}
          <motion.div
            variants={item}
            className="flex items-center gap-3 mt-2"
          >
            {/* Overlapping avatars */}
            <div className="flex -space-x-2.5">
              {AVATARS.map((av) => (
                <div
                  key={av.initials}
                  className="w-8 h-8 rounded-full border-2 border-[#080a0e] flex items-center justify-center text-[10px] font-bold text-white select-none flex-shrink-0"
                  style={{ backgroundColor: av.bg }}
                >
                  {av.initials}
                </div>
              ))}
            </div>
            <span className="text-sm text-white/55">
              Trusted by leading gaming agencies
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
