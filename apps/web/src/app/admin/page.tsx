'use client';

import React from 'react';
import { ShieldCheck, Activity, Users, Store, DollarSign, RefreshCw } from 'lucide-react';

export default function AdminConsole() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center text-xs font-semibold text-purple-600 tracking-wider uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 mr-2" />
            Persona: Meera Sundaram (Marketplace Admin)
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Marketplace Control Center</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live Ops • Audit Logs • Settlements • System Metrics
          </p>
        </div>

        <button className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium px-4 py-2 rounded-xl text-sm shadow-sm transition">
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Live Ops</span>
        </button>
      </div>

      {/* Live Ops Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Orders</span>
            <Activity className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">12</div>
          <span className="text-[11px] text-emerald-600">0 stuck (&gt;5m)</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Riders</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">18</div>
          <span className="text-[11px] text-slate-500">14 busy • 4 idle</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Live Restaurants</span>
            <Store className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">5</div>
          <span className="text-[11px] text-emerald-600">100% online in Bengaluru</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Today's GMV</span>
            <DollarSign className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">₹14,280.00</div>
          <span className="text-[11px] text-slate-500">Platform Comm: ₹2,856.00</span>
        </div>
      </div>

      {/* Audit Log / Stuck Order Alert Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900">System Reliability & Audit Stream</h3>
        <div className="text-xs text-slate-500">
          Showing real-time audit entries for order state machines, payment webhooks, and dispatch assignments.
        </div>
        <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
          <div className="p-3 bg-slate-50 flex items-center justify-between text-slate-600">
            <span>SYSTEM_BOOT</span>
            <span className="text-slate-400 font-mono">Just now</span>
          </div>
          <div className="p-3 bg-white flex items-center justify-between text-slate-600">
            <span>PostGIS Extension verified on PostgreSQL 16</span>
            <span className="text-emerald-600 font-semibold">SUCCESS</span>
          </div>
          <div className="p-3 bg-white flex items-center justify-between text-slate-600">
            <span>Demo city Bengaluru Central Cluster initialized</span>
            <span className="text-emerald-600 font-semibold">IDEMPOTENT</span>
          </div>
        </div>
      </div>
    </div>
  );
}
