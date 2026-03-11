import React, { useState, useRef, useEffect } from 'react'
import { RefreshCw, Loader2, ChevronDown } from 'lucide-react'

const COUNT_OPTIONS = [3, 12, 30]
const DAY_OPTIONS   = [3, 7, 14, 30]

/**
 * Scan button with a dropdown menu.
 *
 * Props:
 *   onScan(opts)   – called with { mode: 'count'|'days', count?, days? }
 *   scanning       – boolean, shows spinner when true
 *   label          – button label (default "Scan")
 *   className      – extra classes for the trigger button
 */
export default function ScanMenu({ onScan, scanning = false, label = 'Scan', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function pick(opts) {
    setOpen(false)
    onScan(opts)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !scanning && setOpen(o => !o)}
        disabled={scanning}
        className={`flex items-center gap-1.5 disabled:opacity-50 transition-colors ${className}`}
      >
        {scanning ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
        {label}
        {!scanning && <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`}/>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#13161d] border border-[#2a2f3d] rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 pt-3 pb-1">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest mb-2">Past Videos</p>
            <div className="flex gap-1.5 mb-3">
              {COUNT_OPTIONS.map(n => (
                <button key={n} onClick={() => pick({ mode: 'count', count: n, force: true })}
                  className="flex-1 py-1.5 rounded-lg bg-[#1a1e28] hover:bg-[#4f74f3] text-slate-300 hover:text-white text-xs font-semibold transition-colors">
                  {n}
                </button>
              ))}
            </div>
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest mb-2">Past Days</p>
            <div className="flex gap-1.5 pb-3">
              {DAY_OPTIONS.map(d => (
                <button key={d} onClick={() => pick({ mode: 'days', days: d })}
                  className="flex-1 py-1.5 rounded-lg bg-[#1a1e28] hover:bg-[#7c3aed] text-slate-300 hover:text-white text-xs font-semibold transition-colors">
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
