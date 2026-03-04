import React from 'react'
import { motion } from 'motion/react'
import { Check, ArrowRight } from 'lucide-react'

const PLANS = [
  {
    name: 'Starter',
    price: '$249',
    period: '/mo',
    description: 'Perfect for boutique agencies tracking a focused creator roster.',
    featured: false,
    cta: 'Request Access',
    features: [
      'Up to 10 competitor creators',
      'TikTok + Twitch + YouTube',
      'Real-time Discord & email alerts',
      'Deal feed + Brand Radar dashboard',
      'Weekly intelligence digest',
      'CSV export',
    ],
  },
  {
    name: 'Agency',
    price: '$599',
    period: '/mo',
    description: 'Built for growing agencies managing multiple client rosters.',
    featured: true,
    badge: 'Most Popular',
    cta: 'Request Access',
    features: [
      'Up to 40 competitor creators',
      'All platforms',
      'Discord, Slack & email alerts',
      'Full dashboard + Opportunities board',
      'Weekly PDF intelligence report',
      'CSV + deal trend charts',
      'Custom alert thresholds',
    ],
  },
  {
    name: 'Enterprise',
    price: '$1,499',
    period: '/mo',
    description: 'For large agencies and multi-brand talent management groups.',
    featured: false,
    cta: 'Request Access',
    features: [
      'Unlimited creators',
      'All platforms',
      'Multi-brand client portals',
      'White-label weekly reports',
      'Dedicated Slack channel',
      'API access',
      'Custom onboarding',
    ],
  },
]

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
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

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-[#080a0e]">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-14"
        >
          <span className="inline-block mb-4 text-xs font-semibold tracking-widest uppercase text-[#4f74f3]">
            Pricing
          </span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-[#e2e8f0] tracking-tight leading-tight">
            Intelligence that pays
            <br />
            <span className="text-white/50">for itself in one deal.</span>
          </h2>
          <p className="mt-4 text-[#64748b] text-base max-w-lg mx-auto">
            Every plan includes real-time deal detection, multi-platform monitoring, and the Opportunities board — so your team always pitches first.
          </p>
        </motion.div>

        {/* Pricing grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch"
        >
          {PLANS.map((plan) => (
            <motion.div
              key={plan.name}
              variants={cardVariants}
              className={[
                'relative flex flex-col rounded-2xl p-7 transition-colors duration-200',
                plan.featured
                  ? 'bg-[#13161d] border border-[#4f74f3] shadow-[0_0_60px_-15px_rgba(79,116,243,0.35)]'
                  : 'bg-[#13161d] border border-[#222736] hover:border-[#394057]',
              ].join(' ')}
            >
              {/* Most Popular badge */}
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-[#4f74f3] text-white shadow-lg">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Plan name & description */}
              <div className="mb-6">
                <h3 className="font-display text-lg font-bold text-[#e2e8f0] mb-1">
                  {plan.name}
                </h3>
                <p className="text-sm text-[#64748b] leading-relaxed">
                  {plan.description}
                </p>
              </div>

              {/* Price */}
              <div className="mb-7">
                <div className="flex items-end gap-1">
                  <span className="font-display text-4xl font-bold text-[#e2e8f0] tracking-tight">
                    {plan.price}
                  </span>
                  <span className="text-[#64748b] text-sm mb-1.5">{plan.period}</span>
                </div>
              </div>

              {/* CTA button */}
              {plan.featured ? (
                <div className="relative inline-block group mb-7">
                  <div className="absolute inset-0 bg-orange-600 blur-xl opacity-20 rounded-xl transition-opacity duration-300 group-hover:opacity-50" />
                  <a
                    href="#cta"
                    className="btn-primary group relative w-full justify-center"
                  >
                    {plan.cta}
                    <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </a>
                </div>
              ) : (
                <a
                  href="#cta"
                  className="mb-7 inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl font-semibold text-[15px] text-[#94a3b8] border border-[#222736] hover:border-[#394057] hover:text-[#e2e8f0] transition-colors duration-150"
                >
                  {plan.cta}
                </a>
              )}

              {/* Divider */}
              <div className="h-px bg-[#222736] mb-6" />

              {/* Feature list */}
              <ul className="flex flex-col gap-3 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span
                      className={[
                        'flex-shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center',
                        plan.featured
                          ? 'bg-[#4f74f3]/20 text-[#4f74f3]'
                          : 'bg-[#fb923c]/15 text-[#fb923c]',
                      ].join(' ')}
                    >
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                    <span className="text-sm text-[#94a3b8] leading-snug">{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom note */}
        <p className="text-center text-xs text-[#475569] mt-10">
          All plans billed monthly. Annual plans available — contact us for a quote.
          No setup fees. Cancel anytime.
        </p>
      </div>
    </section>
  )
}
