import React from 'react'
import { ArrowRight } from 'lucide-react'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-[#080a0e] border-t border-[#222736]">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5 flex-shrink-0">
          <span className="flex items-center justify-center w-7 h-7 rounded-md bg-[#4f74f3] text-white font-bold text-xs leading-none select-none">
            RS
          </span>
          <span className="font-semibold text-[#e2e8f0] text-[14px] tracking-tight">
            Respawn Signal
          </span>
        </a>

        {/* Copyright */}
        <p className="text-xs text-[#475569] text-center">
          &copy; {year} Respawn Signal. All rights reserved.
        </p>

        {/* Dashboard link */}
        <a
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94a3b8] hover:text-[#e2e8f0] transition-colors duration-150"
        >
          Dashboard
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </footer>
  )
}
