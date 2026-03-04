import React from 'react'
import { motion } from 'motion/react'
import { UserPlus, FileText, Zap, BarChart2 } from 'lucide-react'

const STEPS = [
  {
    number: '01',
    icon: UserPlus,
    title: 'Add competitor creators',
    description:
      'Tell us which creators your competitors manage. We watch every video, live stream, and short-form post across all major platforms.',
  },
  {
    number: '02',
    icon: FileText,
    title: 'AI transcribes every video',
    description:
      'Every video is automatically transcribed in real time, capturing every word including ad reads, mid-roll integrations, and pinned sponsor mentions.',
  },
  {
    number: '03',
    icon: Zap,
    title: 'Deals get classified instantly',
    description:
      'Our AI distinguishes paid sponsorships from organic mentions with 90%+ accuracy. Each deal is logged with brand name, creator, platform, and confidence score.',
  },
  {
    number: '04',
    icon: BarChart2,
    title: 'Your pitch list updates',
    description:
      'Brands actively spending on competitor talent flow directly into your Opportunities board — so your sales team always knows who to call next.',
  },
]

const cardVariants = {
  hidden: { opacity: 0, y: 32 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
}

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12 },
  },
}

export default function HowItWorks() {
  return (
    <section id="features" className="py-24 bg-[#080a0e]">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-16"
        >
          <span className="inline-block mb-4 text-xs font-semibold tracking-widest uppercase text-[#4f74f3]">
            How it works
          </span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-[#e2e8f0] tracking-tight leading-tight">
            Automated deal tracking.
            <br />
            <span className="text-white/50">Zero manual research.</span>
          </h2>
        </motion.div>

        {/* Step cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.number}
                variants={cardVariants}
                className="card p-6 flex flex-col gap-4 group hover:border-[#394057] transition-colors duration-200"
              >
                {/* Step number + icon row */}
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-[#fb923c]/15 border border-[#fb923c]/25 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-[#fb923c]" />
                  </div>
                  <span className="text-3xl font-bold text-[#222736] font-display select-none">
                    {step.number}
                  </span>
                </div>

                {/* Text */}
                <div>
                  <h3 className="font-display font-semibold text-[#e2e8f0] text-[15px] leading-snug mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-[#64748b] leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Connector line hint (desktop only) */}
        <div className="hidden lg:flex items-center justify-center mt-10 gap-1 opacity-30">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-16 h-px bg-[#4f74f3]" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#4f74f3]" />
            </div>
          ))}
          <div className="w-16 h-px bg-[#4f74f3]" />
        </div>
      </div>
    </section>
  )
}
