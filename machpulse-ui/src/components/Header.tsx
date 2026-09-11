import React from 'react';
import { NavTab } from '../types';

interface HeaderProps {
  currentTab: NavTab;
  setCurrentTab: (tab: NavTab) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
}) => {
  const tabs: { id: NavTab; label: string }[] = [
    { id: 'OVERVIEW', label: 'Overview' },
    { id: 'TELEMETRY', label: 'Telemetry' },
    { id: 'DIAGNOSTICS', label: 'Diagnostics' },
    { id: 'MAINTENANCE', label: 'Maintenance' },
    { id: 'VALIDATION', label: 'Validation' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#FFFDF0] border-b-4 border-black px-4 sm:px-8 py-3.5 sm:py-5 shadow-[0_4px_0_#000]">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Identity */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="title-group flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="font-comic text-3xl sm:text-4xl lg:text-5xl font-bold leading-none text-black tracking-tight">
                MachPulse
              </h1>
              <div className="comic-badge text-[10px] sm:text-xs">
                From Machine Signals to Maintenance Decisions
              </div>
            </div>
            <p className="text-xs font-bold text-slate-700 hidden md:block mt-1">
              MetroPT-3 · Historical Telemetry · Predictive Maintenance Decision Support
            </p>
          </div>
        </div>

        {/* Server & Engine Status Tag */}
        <div className="flex items-center gap-3">
          <div 
            className="user-tag hidden sm:flex items-center gap-2"
            style={{ background: '#C1F6C9', color: '#000' }}
            title="FastAPI server connection active"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-600 border border-black animate-pulse" />
            <span className="text-xs font-mono font-black tracking-wider">
              API CONNECTED • MAHALANOBIS • METROPT-3
            </span>
          </div>
        </div>
      </div>

      {/* Primary 4-Screen Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t-2 border-black/20">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`comic-tab ${isActive ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          );
        })}

        <div className="ml-auto hidden xl:flex items-center gap-2 text-xs font-mono text-slate-600 font-bold">
          <span>Predict less. Understand more. Act safely.</span>
        </div>
      </div>
    </header>
  );
};
