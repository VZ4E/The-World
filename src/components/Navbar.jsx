import React, { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Reviews', href: '#reviews' },
  { label: 'Dashboard', href: '/dashboard' },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-[#080a0e]/85 backdrop-blur-md border-b border-[#222736]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5 flex-shrink-0">
          <span className="flex items-center justify-center w-8 h-8 rounded-md bg-[#4f74f3] text-white font-bold text-sm leading-none select-none">
            RS
          </span>
          <span className="font-semibold text-[#e2e8f0] text-[15px] tracking-tight">
            Respawn Signal
          </span>
        </a>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-[#94a3b8] hover:text-[#e2e8f0] transition-colors duration-150"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA buttons */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="/dashboard"
            className="text-sm font-medium text-[#94a3b8] hover:text-[#e2e8f0] px-4 py-2 rounded-lg border border-[#222736] hover:border-[#394057] transition-colors duration-150"
          >
            Sign In
          </a>
          <a
            href="#cta"
            className="btn-primary !px-5 !py-2 !text-sm !rounded-lg"
          >
            Get Access
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#13161d] transition-colors"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden overflow-hidden border-t border-[#222736] bg-[#080a0e]/95 backdrop-blur-md"
          >
            <div className="flex flex-col px-6 py-4 gap-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-[#94a3b8] hover:text-[#e2e8f0] py-2.5 transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="h-px bg-[#222736] my-2" />
              <a
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-[#94a3b8] hover:text-[#e2e8f0] py-2.5 transition-colors"
              >
                Sign In
              </a>
              <a
                href="#cta"
                onClick={() => setMobileOpen(false)}
                className="btn-primary !text-sm !rounded-lg mt-1 text-center"
              >
                Get Access
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
