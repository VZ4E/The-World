import React from 'react'
import TopBar from '../components/TopBar'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import HowItWorks from '../components/HowItWorks'
import DealFeedPreview from '../components/DealFeedPreview'
import Pricing from '../components/Pricing'
import CTA from '../components/CTA'
import Footer from '../components/Footer'

export default function Landing() {
  return (
    <div className="bg-[#080a0e] text-[#e2e8f0]">
      <TopBar />
      <Navbar />
      <Hero />
      <HowItWorks />
      <DealFeedPreview />
      <Pricing />
      <CTA />
      <Footer />
    </div>
  )
}
