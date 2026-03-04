import React from 'react'
import { motion } from 'motion/react'

const deals = [
  {
    brand: 'G FUEL',
    platform: 'tiktok',
    creator: '@topkreator',
    time: '4h ago',
    conf: 94,
    snippet: '"Honestly this G FUEL collab flavor is actually insane..."',
  },
  {
    brand: 'NordVPN',
    platform: 'twitch',
    creator: '@grindset_clips',
    time: '6h ago',
    conf: 97,
    snippet: '"Before we get into it, huge shoutout to NordVPN for sponsoring..."',
  },
  {
    brand: 'Razer',
    platform: 'tiktok',
    creator: '@fps_legend',
    time: '8h ago',
    conf: 91,
    snippet: '"I\'ve been rocking this Razer setup for a month now..."',
  },
  {
    brand: 'Secretlab',
    platform: 'twitch',
    creator: '@couch_warrior',
    time: '10h ago',
    conf: 98,
    snippet: '"Secretlab sent me this chair and honestly it\'s unreal..."',
  },
]

const PLATFORM_STYLES = {
  tiktok: {
    label: 'TikTok',
    className: 'bg-pink-500/15 text-pink-400 border border-pink-500/25',
  },
  twitch: {
    label: 'Twitch',
    className: 'bg-purple-500/15 text-purple-400 border border-purple-500/25',
  },
}

const rowVariants = {
  hidden: { opacity: 0, x: -16 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
}

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1 },
  },
}

export default function DealFeedPreview() {
  return (
    <section className="py-24 bg-[#080a0e]">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-12"
        >
          <span className="inline-block mb-4 text-xs font-semibold tracking-widest uppercase text-[#4f74f3]">
            Live Dashboard
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#e2e8f0] tracking-tight">
            Every deal, every creator, every platform.
          </h2>
          <p className="mt-3 text-[#64748b] text-base max-w-xl mx-auto">
            Respawn Signal surfaces sponsored deals as they happen — no scraping, no lag, no manual checking.
          </p>
        </motion.div>

        {/* Dashboard card */}
        <div className="max-w-2xl mx-auto">
          <div className="card rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#222736] bg-[#0d0f14]">
              <div>
                <span className="font-semibold text-[#e2e8f0] text-sm">Deal Feed</span>
                <span className="ml-2 text-xs text-[#64748b]">Competitor creators · Sponsored only</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-medium text-emerald-500">Live</span>
              </div>
            </div>

            {/* Deal rows */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-40px' }}
              className="divide-y divide-[#222736]"
            >
              {deals.map((deal, idx) => {
                const platform = PLATFORM_STYLES[deal.platform]
                return (
                  <motion.div
                    key={idx}
                    variants={rowVariants}
                    className="flex items-start gap-4 px-5 py-4 hover:bg-[#0d0f14] transition-colors duration-150 group"
                  >
                    {/* Left: brand + badges + snippet */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-bold text-[#e2e8f0] text-sm">{deal.brand}</span>
                        <span className="badge-deal text-[11px]">Sponsored</span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${platform.className}`}
                        >
                          {platform.label}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748b] truncate leading-relaxed mb-1">
                        {deal.snippet}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#475569]">
                        <span className="font-medium text-[#94a3b8]">{deal.creator}</span>
                        <span>·</span>
                        <span>{deal.time}</span>
                      </div>
                    </div>

                    {/* Right: confidence */}
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xs text-[#64748b] mb-0.5">Confidence</div>
                      <div className="text-sm font-bold text-[#fb923c]">{deal.conf}%</div>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>

            {/* Card footer */}
            <div className="px-5 py-3.5 border-t border-[#222736] bg-[#0d0f14] flex items-center justify-between">
              <span className="text-[11px] text-[#475569]">Showing 4 of 247 deals detected today</span>
              <button className="text-[11px] font-medium text-[#4f74f3] hover:text-[#7b96f8] transition-colors">
                View all deals →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
