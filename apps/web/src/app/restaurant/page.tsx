'use client';

import React, { useState, useEffect } from 'react';
import {
  ChefHat,
  Bell,
  CheckCircle2,
  Clock,
  Power,
  ToggleLeft,
  ToggleRight,
  Plus,
  Edit2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { GreenVegIcon, RedNonVegIcon } from '@/components/VegIcons';
import { formatPaiseToInr } from '@tiffin/shared';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  isVeg: boolean;
  isAvailable: boolean;
  modifierGroups?: any[];
}

interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

export default function RestaurantKitchenBoard() {
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeTab, setActiveTab] = useState<'kds' | 'menu'>('menu');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchRestaurantData();
  }, []);

  const fetchRestaurantData = async () => {
    setIsLoading(true);
    const token = localStorage.getItem('tiffin_token');

    try {
      // 1. Fetch Profile
      const profRes = await fetch(`${apiUrl}/r/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profRes.ok) {
        const prof = await profRes.json();
        setIsAcceptingOrders(prof.acceptingOrders);
      }

      // 2. Fetch Menu
      const menuRes = await fetch(`${apiUrl}/r/menu`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        setCategories(menuData);
      }
    } catch (err) {
      console.error('Failed to load restaurant data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAcceptingOrders = async () => {
    const token = localStorage.getItem('tiffin_token');
    const newState = !isAcceptingOrders;

    try {
      const res = await fetch(`${apiUrl}/r/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ acceptingOrders: newState }),
      });

      if (res.ok) {
        setIsAcceptingOrders(newState);
        showToast(
          newState
            ? 'Kitchen is ONLINE and accepting customer orders!'
            : 'Kitchen is PAUSED. Customers cannot place new orders.'
        );
      }
    } catch {
      alert('Failed to update kitchen status');
    }
  };

  const handleToggleDishStock = async (itemId: string, currentStatus: boolean) => {
    const token = localStorage.getItem('tiffin_token');
    const newStatus = !currentStatus;

    try {
      const res = await fetch(`${apiUrl}/r/menu/items/${itemId}/availability`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isAvailable: newStatus }),
      });

      if (res.ok) {
        // Optimistically update local categories state
        setCategories((prev) =>
          prev.map((cat) => ({
            ...cat,
            items: cat.items.map((item) =>
              item.id === itemId ? { ...item, isAvailable: newStatus } : item
            ),
          }))
        );

        showToast(
          newStatus
            ? 'Dish marked IN STOCK. Immediately visible to customers.'
            : 'Dish marked OUT OF STOCK. Immediately greyed out in customer browse.'
        );
      }
    } catch {
      alert('Failed to update item availability');
    }
  };

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Toast Notification */}
      {statusMessage && (
        <div className="fixed top-16 right-4 z-50 bg-slate-900 text-white border border-slate-700 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Header & Master Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center text-xs font-semibold text-orange-600 tracking-wider uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" />
            Persona: Ravi Patel (Kitchen Lead / Owner)
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Khau Galli Chaat & Street Eats — Kitchen Console
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Indiranagar Branch • Real-time Menu & Out-of-Stock Controls
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Master Kitchen Switch */}
          <button
            onClick={handleToggleAcceptingOrders}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs border ${
              isAcceptingOrders
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isAcceptingOrders ? 'Accepting Orders (Online)' : 'Paused Orders (Offline)'}</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('menu')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'menu'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Menu & Stock Manager (FR-12)
        </button>
        <button
          onClick={() => setActiveTab('kds')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'kds'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Live Kitchen Display (Phase 2 Preview)
        </button>
      </div>

      {/* Tab 1: Menu & Stock Controls (Phase 1 Showpiece) */}
      {activeTab === 'menu' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Live Item Stock Controls</h2>
              <p className="text-xs text-slate-500">
                Toggling an item updates PostgreSQL, bumps the cache version, and immediately marks the dish out-of-stock in Asha&apos;s customer app.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {categories.map((category) => (
              <div key={category.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span>{category.name}</span>
                  <span className="text-xs font-normal text-slate-400">
                    {category.items.length} items
                  </span>
                </h3>

                <div className="divide-y divide-slate-100">
                  {category.items.map((dish) => (
                    <div
                      key={dish.id}
                      className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {dish.isVeg ? <GreenVegIcon /> : <RedNonVegIcon />}
                          <span className="font-bold text-slate-900 text-sm">{dish.name}</span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                              dish.isAvailable
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {dish.isAvailable ? 'IN STOCK' : 'OUT OF STOCK'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-semibold">
                          {formatPaiseToInr(dish.pricePaise)}
                          {dish.description && ` • ${dish.description}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        {/* Instant Stock Toggle */}
                        <button
                          onClick={() => handleToggleDishStock(dish.id, dish.isAvailable)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                            dish.isAvailable
                              ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                          }`}
                        >
                          {dish.isAvailable ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                          <span>{dish.isAvailable ? 'Mark Out of Stock' : 'Mark In Stock'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: KDS Kanban Board (Phase 2 Preview) */}
      {activeTab === 'kds' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-100 rounded-3xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-orange-500" />
                <span>New Orders (Auto-Reject Countdown)</span>
              </h3>
              <span className="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-0.5 rounded-full">0</span>
            </div>
            <div className="bg-white/60 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-400 text-xs">
              Orders placed by customers will trigger an audible alert here in Phase 2.
            </div>
          </div>

          <div className="bg-slate-100 rounded-3xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>Preparing in Kitchen</span>
              </h3>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">0</span>
            </div>
            <div className="bg-white/60 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-400 text-xs">
              Accepted orders with cooking countdown timers appear here.
            </div>
          </div>

          <div className="bg-slate-100 rounded-3xl p-5 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Ready for Rider Pickup</span>
              </h3>
              <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full">0</span>
            </div>
            <div className="bg-white/60 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-400 text-xs">
              Rider ETA shown here. Handover confirmed via rider OTP.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
