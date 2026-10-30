import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { api } from '../api/client';

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchHealth = async () => {
      try {
        const health = await api.getHealth();
        if (mounted) setSystemHealth(health);
      } catch (err) {
        console.warn('[SystemHealth] Backend notice:', err.message);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#172033] flex flex-col font-sans">
      {/* Sidebar */}
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        systemHealth={systemHealth}
      />

      {/* Main Content Area */}
      <div className="lg:pl-60 flex flex-col flex-1 min-h-screen bg-[#F4F6FA]">
        <Navbar
          onOpenMobileSidebar={() => setMobileOpen(true)}
          systemHealth={systemHealth}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-7 max-w-6xl w-full mx-auto bg-[#F4F6FA]">
          <Outlet context={{ systemHealth }} />
        </main>
      </div>
    </div>
  );
}
