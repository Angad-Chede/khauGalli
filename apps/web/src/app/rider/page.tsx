'use client';

import React from 'react';
import { Bike, MapPin, DollarSign, Power, Navigation } from 'lucide-react';

export default function RiderDashboard() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center text-xs font-semibold text-blue-600 tracking-wider uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
            Persona: Imran Khan (Delivery Partner)
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Rider Partner Console</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Vehicle: 2-Wheeler (KA-01-EQ-9876) • Zone: Bengaluru Central
          </p>
        </div>

        <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-xl text-sm shadow-sm transition">
          <Power className="w-4 h-4" />
          <span>You are Online</span>
        </button>
      </div>

      {/* Earnings Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Today's Earnings</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">₹680.00</div>
          <span className="text-[11px] text-emerald-600 font-medium">8 orders completed</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Weekly Total</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">₹4,920.00</div>
          <span className="text-[11px] text-slate-500 font-medium">Incentives: ₹450.00</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Acceptance Rate</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">94%</div>
          <span className="text-[11px] text-slate-500 font-medium">Avg delivery time: 18m</span>
        </div>
      </div>

      {/* Active Delivery or Standby Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
          <Navigation className="w-6 h-6 animate-pulse" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Waiting for Delivery Offers</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          GPS location updates are posted every 5-10 seconds to Redis/Postgres. When an order matches in Bengaluru Central, a 30-second offer card will appear here.
        </p>
      </div>
    </div>
  );
}
