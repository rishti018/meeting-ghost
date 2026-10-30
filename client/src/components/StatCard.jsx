import React from 'react';

export function StatCard({ title, value, subtitle, icon: Icon }) {
  return (
    <div className="ghost-panel p-4 flex flex-col justify-between bg-[#FFFFFF] border border-[#DCE2EB]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#526078] uppercase tracking-wider">
          {title}
        </span>
        {Icon && (
          <div className="p-1.5 rounded-sm bg-[#F4F6FA] border border-[#DCE2EB] text-[#526078]">
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-[#172033] font-sans">
          {value}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[#526078] font-normal">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
