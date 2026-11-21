'use client';

import React from 'react';
import { ChefHat, Bell, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

export default function RestaurantKitchenBoard() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center text-xs font-semibold text-orange-600 tracking-wider uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" />
            Persona: Ravi Patel (Kitchen Lead)
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Live Kitchen Display System (KDS)</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Khau Galli Chaat & Street Eats • Indiranagar Branch
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Kitchen Online (Accepting Orders)
          </div>
        </div>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: New Incoming Orders */}
        <div className="bg-slate-100 rounded-2xl p-4 border border-slate-200 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-500" />
              <span>Incoming Orders</span>
            </h2>
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
              0
            </span>
          </div>
          <div className="bg-white/60 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400 text-xs">
            No pending incoming orders. Audible chime will trigger when a new order arrives.
          </div>
        </div>

        {/* Column 2: In Preparation */}
        <div className="bg-slate-100 rounded-2xl p-4 border border-slate-200 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>Preparing in Kitchen</span>
            </h2>
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
              0
            </span>
          </div>
          <div className="bg-white/60 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400 text-xs">
            Orders accepted by Ravi move here with cooking countdown timer.
          </div>
        </div>

        {/* Column 3: Ready for Pickup */}
        <div className="bg-slate-100 rounded-2xl p-4 border border-slate-200 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Ready for Handover</span>
            </h2>
            <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
              0
            </span>
          </div>
          <div className="bg-white/60 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400 text-xs">
            Rider ETA shown here. Handover confirmed via rider OTP.
          </div>
        </div>
      </div>
    </div>
  );
}
