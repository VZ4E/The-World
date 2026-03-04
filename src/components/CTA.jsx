import React, { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

export default function CTA() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()

    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }

    setError('')
    setSubmitted(true)
  }

  return (
    <section
      id="cta"
      className="relative py-24 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,80,20,0.12) 0%, transparent 70%), #080a0e',
      }}
    >
      {/* Decorative top border glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#fb923c]/40 to-transparent" />

      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-2xl mx-auto text-center"
        >
          {/* Eyebrow */}
          <span className="inline-block mb-5 text-xs font-semibold tracking-widest uppercase text-[#fb923c]">
            Early Access
          </span>

          {/* Heading */}
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-[#e2e8f0] tracking-tight leading-tight mb-5">
            Your competitors are signing deals.
            <br />
            <span className="text-white/50">Do you know which ones?</span>
          </h2>

          {/* Subtext */}
          <p className="text-[#64748b] text-base leading-relaxed mb-10 max-w-lg mx-auto">
            Join agencies already using Respawn Signal to track competitor sponsorships
            in real time — so your pitch lands before anyone else's email is even opened.
          </p>

          {/* Form or thank-you state */}
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex items-center gap-3 px-7 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-[15px]"
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              You're on the list — we'll be in touch soon.
            </motion.div>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-md mx-auto"
            >
              <div className="flex-1 min-w-0">
                <label htmlFor="cta-email" className="sr-only">
                  Work email address
                </label>
                <input
                  id="cta-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (error) setError('')
                  }}
                  placeholder="your@agency.com"
                  autoComplete="email"
                  required
                  className={[
                    'w-full px-4 py-3.5 rounded-xl bg-[#13161d] text-[#e2e8f0] text-sm placeholder:text-[#475569] outline-none transition-colors duration-150',
                    error
                      ? 'border border-red-500/70 focus:border-red-400'
                      : 'border border-[#222736] focus:border-[#4f74f3]',
                  ].join(' ')}
                />
              </div>

              <div className="relative inline-block group flex-shrink-0">
                <div className="absolute inset-0 bg-orange-600 blur-xl opacity-20 rounded-xl transition-opacity duration-300 group-hover:opacity-50" />
                <button type="submit" className="btn-primary group relative w-full sm:w-auto">
                  Request Access
                  <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                </button>
              </div>
            </form>
          )}

          {/* Inline validation error */}
          {error && !submitted && (
            <p className="mt-3 text-xs text-red-400">{error}</p>
          )}

          {/* Micro-trust copy */}
          {!submitted && (
            <p className="mt-4 text-xs text-[#475569]">
              No credit card required. We'll reach out within 24 hours.
            </p>
          )}
        </motion.div>
      </div>

      {/* Decorative bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#222736] to-transparent" />
    </section>
  )
}
