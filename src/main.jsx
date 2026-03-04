import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import CreatorAdmin from './pages/CreatorAdmin'
import AgentStudio from './pages/AgentStudio'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/creators"  element={<CreatorAdmin />} />
        <Route path="/agents"    element={<AgentStudio />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
