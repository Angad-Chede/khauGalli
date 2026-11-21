'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, Search, Clock, Star, ShoppingBag, ArrowRight } from 'lucide-react';

export default function CustomerDashboard() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header & Location */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center text-xs font-semibold text-orange-600 tracking-wider uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" />
            Persona: Asha Sharma (Customer)
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Food Discovery & Browse</h1>
          <div className="flex items-center text-sm text-slate-600 mt-1">
            <MapPin className="w-4 h-4 text-orange-500 mr-1.5 shrink-0" />
            <span>Delivering to: <strong>Flat 402, 12th Main, Indiranagar, Bengaluru</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium px-4 py-2 rounded-xl text-sm shadow-sm transition">
            <ShoppingBag className="w-4 h-4" />
            <span>Cart (0 items)</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search for restaurants, chaats, dosas, biryani, or dishes..."
          className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
        />
      </div>

      {/* Featured Restaurant Cards (Phase 1 Preview) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Nearby Restaurants (Within 3 km)</h2>
          <span className="text-xs text-slate-500">PostGIS ST_DWithin Active</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Restaurant Card 1 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition">
            <div className="h-36 bg-gradient-to-r from-orange-400 to-amber-400 relative p-4 flex flex-col justify-end text-white">
              <span className="absolute top-3 right-3 bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                OPEN NOW
              </span>
              <h3 className="text-lg font-bold">Khau Galli Chaat & Street Eats</h3>
              <p className="text-xs text-orange-100">Street Food • Chaat • North Indian</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>15-20 mins (Rolling median)</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                  <span>4.6</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 line-clamp-2">
                Famous Pani Puri, Mumbai Sev Puri, and Special Amul Butter Pav Bhaji.
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">₹80 for one</span>
                <span className="text-xs font-semibold text-orange-600 flex items-center gap-1">
                  View Menu <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </div>

          {/* Restaurant Card 2 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition">
            <div className="h-36 bg-gradient-to-r from-amber-500 to-yellow-500 relative p-4 flex flex-col justify-end text-white">
              <span className="absolute top-3 right-3 bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                OPEN NOW
              </span>
              <h3 className="text-lg font-bold">Biryani Darbar</h3>
              <p className="text-xs text-amber-100">Biryani • Mughlai • Kebabs</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>25-30 mins</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                  <span>4.8</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 line-clamp-2">
                Slow-cooked fragrant dum biryanis, succulent kebabs, and rich gravies.
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">₹240 for one</span>
                <span className="text-xs font-semibold text-orange-600 flex items-center gap-1">
                  View Menu <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </div>

          {/* Restaurant Card 3 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition">
            <div className="h-36 bg-gradient-to-r from-emerald-500 to-teal-500 relative p-4 flex flex-col justify-end text-white">
              <span className="absolute top-3 right-3 bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                OPEN NOW
              </span>
              <h3 className="text-lg font-bold">Bowl & Greens</h3>
              <p className="text-xs text-emerald-100">Healthy • Salads • Continental</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>15-20 mins</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                  <span>4.5</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 line-clamp-2">
                Nutritious quinoa grain bowls, farm fresh garden salads, and cold-pressed juices.
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">₹180 for one</span>
                <span className="text-xs font-semibold text-orange-600 flex items-center gap-1">
                  View Menu <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
