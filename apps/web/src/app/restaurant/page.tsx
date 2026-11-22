'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ChefHat,
  Bell,
  CheckCircle2,
  Clock,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  X,
  Volume2,
  VolumeX,
  RefreshCw,
  AlertTriangle,
  Radio,
  Bike,
  ShieldCheck,
  TrendingUp,
  DollarSign,
  Package,
} from 'lucide-react';
import { GreenVegIcon, RedNonVegIcon } from '@/components/VegIcons';
import { formatPaiseToInr } from '@tiffin/shared';

interface OrderItem {
  id: string;
  itemSnapshot: { name: string; basePricePaise: number };
  quantity: number;
  unitPricePaise: number;
  modifiersTotalPaise: number;
  lineTotalPaise: number;
  selectedModifiersSnapshot?: { name: string; pricePaise: number }[];
}

interface DeliveryDetails {
  id: string;
  status: string;
  distanceMeters: number;
  payoutPaise: number;
  pickupOtp?: string;
  rider?: {
    id: string;
    name: string;
    phone: string;
    vehicleNumber: string;
    vehicleType: string;
    ratingAverage: string;
  } | null;
}

interface ActiveOrder {
  id: string;
  orderNumber: string;
  userId: string;
  restaurantId: string;
  status: string;
  paymentMode: string;
  grandTotalPaise: number;
  prepTimeMinutes: number | null;
  cancellationReason: string | null;
  customerNotes: string | null;
  placedAt: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  createdAt: string;
  items: OrderItem[];
  delivery?: DeliveryDetails | null;
  elapsedSeconds: number;
  autoRejectRemainingSeconds: number;
}

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

interface KitchenMetrics {
  activeOrdersCount: number;
  completedOrdersToday: number;
  revenuePaiseToday: number;
  averagePrepTimeMinutes: number;
  acceptanceRatePercent: number;
}

export default function RestaurantKitchenBoard() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeTab, setActiveTab] = useState<'kds' | 'menu'>('kds');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSseConnected, setIsSseConnected] = useState(false);

  // KDS Orders state
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [metrics, setMetrics] = useState<KitchenMetrics | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [rejectingOrder, setRejectingOrder] = useState<ActiveOrder | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Kitchen overloaded with orders');
  const [selectedPrepTimes, setSelectedPrepTimes] = useState<Record<string, number>>({});

  const previousPlacedCount = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    ensureStaffAuth().then(() => {
      fetchInitialData();
    });
  }, []);

  // Real-time polling fallback every 4 seconds
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 4000);
    return () => clearInterval(interval);
  }, []);

  // Connect to SSE stream for instantaneous order push
  useEffect(() => {
    const token = localStorage.getItem('tiffin_staff_token') || localStorage.getItem('tiffin_token');
    if (!token || !restaurantId) return;

    try {
      const sse = new EventSource(`${apiUrl}/realtime/restaurants/${restaurantId}/orders?token=${token}`);
      eventSourceRef.current = sse;

      sse.onopen = () => {
        setIsSseConnected(true);
      };

      sse.addEventListener('connected', () => {
        setIsSseConnected(true);
      });

      sse.addEventListener('order.incoming', () => {
        playChime();
        fetchOrders();
        showToast('🔔 New incoming order placed!');
      });

      sse.onerror = () => {
        setIsSseConnected(false);
      };
    } catch (err) {
      console.error('SSE initialization error on KDS:', err);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [restaurantId]);

  const ensureStaffAuth = async () => {
    let token = localStorage.getItem('tiffin_staff_token') || localStorage.getItem('tiffin_token');
    if (!token) {
      try {
        // Auto-login as Ravi Patel (Kitchen Lead for Khau Galli Chaat)
        await fetch(`${apiUrl}/auth/request-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '+919999900002' }),
        });

        const verifyRes = await fetch(`${apiUrl}/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '+919999900002', code: '123456' }),
        });

        if (verifyRes.ok) {
          const data = await verifyRes.json();
          localStorage.setItem('tiffin_staff_token', data.token);
        }
      } catch (err) {
        console.error('Failed to auto-authenticate kitchen lead:', err);
      }
    }
  };

  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880.0, audioCtx.currentTime + 0.1); // A5

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch {
      // AudioContext policy
    }
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    const token = localStorage.getItem('tiffin_staff_token') || localStorage.getItem('tiffin_token');

    try {
      // 1. Fetch Profile
      const profRes = await fetch(`${apiUrl}/r/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profRes.ok) {
        const prof = await profRes.json();
        setIsAcceptingOrders(prof.acceptingOrders);
        setRestaurantId(prof.id);
      }

      // 2. Fetch Menu
      const menuRes = await fetch(`${apiUrl}/r/menu`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        setCategories(menuData);
      }

      // 3. Fetch Operational Metrics
      const metricsRes = await fetch(`${apiUrl}/r/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData.metrics);
      }
    } catch (err) {
      console.error('Failed to load restaurant profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOrders = async () => {
    const token = localStorage.getItem('tiffin_staff_token') || localStorage.getItem('tiffin_token');
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/r/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const incomingOrders: ActiveOrder[] = data.orders || [];
        setOrders(incomingOrders);

        const currentPlacedCount = incomingOrders.filter((o) => o.status === 'PLACED').length;
        if (currentPlacedCount > previousPlacedCount.current) {
          playChime();
        }
        previousPlacedCount.current = currentPlacedCount;
      }
    } catch {
      // Background retry
    }
  };

  const handleToggleAcceptingOrders = async () => {
    const token = localStorage.getItem('tiffin_staff_token') || localStorage.getItem('tiffin_token');
    const nextState = !isAcceptingOrders;

    try {
      const res = await fetch(`${apiUrl}/r/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ acceptingOrders: nextState }),
      });

      if (res.ok) {
        setIsAcceptingOrders(nextState);
        showToast(nextState ? 'Kitchen is now OPEN for new orders.' : 'Kitchen is PAUSED. No new orders can be placed.');
      } else {
        alert('Failed to update kitchen status');
      }
    } catch {
      alert('Error updating status');
    }
  };

  const handleToggleItemAvailability = async (itemId: string, currentVal: boolean) => {
    const token = localStorage.getItem('tiffin_staff_token') || localStorage.getItem('tiffin_token');
    const nextVal = !currentVal;

    try {
      const res = await fetch(`${apiUrl}/r/menu/items/${itemId}/availability`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isAvailable: nextVal }),
      });

      if (res.ok) {
        setCategories((prev) =>
          prev.map((cat) => ({
            ...cat,
            items: cat.items.map((item) =>
              item.id === itemId ? { ...item, isAvailable: nextVal } : item
            ),
          }))
        );
        showToast(nextVal ? 'Item marked Available (In Stock)' : 'Item marked 86 (Sold Out)');
      } else {
        alert('Failed to update item availability');
      }
    } catch {
      alert('Error updating item');
    }
  };

  const handleAcceptOrder = async (orderId: string) => {
    const token = localStorage.getItem('tiffin_staff_token') || localStorage.getItem('tiffin_token');
    const prepTime = selectedPrepTimes[orderId] || 20;

    try {
      const res = await fetch(`${apiUrl}/r/orders/${orderId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prepTimeMinutes: prepTime }),
      });

      if (res.ok) {
        showToast(`Order accepted! Cooking target: ${prepTime}m.`);
        fetchOrders();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to accept order');
      }
    } catch {
      alert('Error accepting order');
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectingOrder) return;
    const token = localStorage.getItem('tiffin_staff_token') || localStorage.getItem('tiffin_token');

    try {
      const res = await fetch(`${apiUrl}/r/orders/${rejectingOrder.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectionReason }),
      });

      if (res.ok) {
        setRejectingOrder(null);
        showToast('Order rejected. Customer notified and refunded.');
        fetchOrders();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to reject order');
      }
    } catch {
      alert('Error rejecting order');
    }
  };

  const handleMarkReady = async (orderId: string) => {
    const token = localStorage.getItem('tiffin_staff_token') || localStorage.getItem('tiffin_token');

    try {
      const res = await fetch(`${apiUrl}/r/orders/${orderId}/ready`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        showToast('Food marked READY! Delivery partner dispatched.');
        fetchOrders();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to mark ready');
      }
    } catch {
      alert('Error marking order ready');
    }
  };

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Group orders into Kanban columns
  const incomingOrders = orders.filter((o) => o.status === 'PLACED');
  const preparingOrders = orders.filter((o) => o.status === 'ACCEPTED' || o.status === 'PREPARING');
  const readyOrders = orders.filter((o) => o.status === 'READY');

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Kitchen Operational Bar */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-md">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">Khau Galli Street Kitchen</h1>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  isAcceptingOrders
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {isAcceptingOrders ? '● ACCEPTING ORDERS' : '● PAUSED'}
              </span>
              {isSseConnected ? (
                <span className="flex items-center gap-1 text-[10px] font-black tracking-wider uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  KDS Live SSE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-black tracking-wider uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  Connecting...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Kitchen Lead: Ravi Patel • Bengaluru Indiranagar Cluster
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-2xl border text-xs font-bold transition flex items-center gap-1.5 ${
              soundEnabled
                ? 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                : 'bg-rose-50 text-rose-600 border-rose-200'
            }`}
            title="Toggle sound chime on new orders"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4 text-rose-500" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Chime ON' : 'Chime MUTED'}</span>
          </button>

          <button
            onClick={fetchOrders}
            className="p-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh order feed"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleToggleAcceptingOrders}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition shadow-sm ${
              isAcceptingOrders
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isAcceptingOrders ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            <span>{isAcceptingOrders ? 'Pause Kitchen' : 'Resume Orders'}</span>
          </button>
        </div>
      </div>

      {/* Operational KPI Summary Bar */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center font-black">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">Active Orders</span>
              <span className="text-xl font-black text-slate-900">{orders.length}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">Delivered Today</span>
              <span className="text-xl font-black text-slate-900">{metrics.completedOrdersToday}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">Avg Prep Time</span>
              <span className="text-xl font-black text-slate-900">{metrics.averagePrepTimeMinutes}m</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-black">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">Acceptance Rate</span>
              <span className="text-xl font-black text-purple-700">{metrics.acceptanceRatePercent}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {statusMessage && (
        <div className="bg-slate-900 text-white text-xs px-4 py-3 rounded-2xl shadow-lg flex items-center justify-between animate-fade-in">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('kds')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition ${
            activeTab === 'kds'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Live Kitchen Display (KDS)</span>
          {incomingOrders.length > 0 && (
            <span className="bg-white text-orange-600 text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
              {incomingOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('menu')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition ${
            activeTab === 'menu'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <ChefHat className="w-4 h-4" />
          <span>Menu & 86 Item Manager</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: Live Kitchen Display System (KDS) Kanban Board */}
      {/* ========================================================= */}
      {activeTab === 'kds' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Incoming Orders (3-Minute Auto-Expiry Countdown) */}
          <div className="bg-slate-100/80 rounded-3xl p-4 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping" />
                <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  New Incoming
                </h2>
              </div>
              <span className="bg-orange-500 text-white text-xs font-black px-2.5 py-0.5 rounded-full">
                {incomingOrders.length}
              </span>
            </div>

            {incomingOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-300 text-slate-400 text-xs">
                No new incoming orders right now. Kitchen is clear!
              </div>
            ) : (
              <div className="space-y-4">
                {incomingOrders.map((order) => {
                  const remaining = order.autoRejectRemainingSeconds;
                  const minutes = Math.floor(remaining / 60);
                  const seconds = remaining % 60;
                  const isExpiringSoon = remaining <= 60;

                  return (
                    <div
                      key={order.id}
                      className={`bg-white rounded-2xl p-4 shadow-md border transition space-y-3 ${
                        isExpiringSoon ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200'
                      }`}
                    >
                      {/* Card Header & 3-Min Expiry Alert */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-black text-slate-900 text-sm block">
                            {order.orderNumber}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {formatPaiseToInr(order.grandTotalPaise)} • {order.paymentMode}
                          </span>
                        </div>

                        <div
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black tracking-wider ${
                            isExpiringSoon
                              ? 'bg-rose-100 text-rose-700 animate-pulse'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {minutes}:{seconds < 10 ? `0${seconds}` : seconds}
                          </span>
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="space-y-1.5 divide-y divide-slate-100">
                        {order.items.map((item) => (
                          <div key={item.id} className="pt-1.5 first:pt-0 flex items-start justify-between text-xs">
                            <div>
                              <span className="font-bold text-slate-900">
                                {item.quantity}x {item.itemSnapshot.name}
                              </span>
                              {item.selectedModifiersSnapshot && item.selectedModifiersSnapshot.length > 0 && (
                                <div className="text-[11px] text-slate-500 pl-4 font-medium">
                                  {item.selectedModifiersSnapshot.map((m) => m.name).join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Customer Note if any */}
                      {order.customerNotes && (
                        <div className="bg-amber-50 rounded-xl p-2.5 text-[11px] text-amber-900 border border-amber-200">
                          <span className="font-bold block">Customer Instruction:</span>
                          {order.customerNotes}
                        </div>
                      )}

                      {/* Quick Prep Time Selector */}
                      <div className="pt-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Estimated Cooking Time
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[15, 20, 30].map((mins) => {
                            const isSelected = (selectedPrepTimes[order.id] || 20) === mins;
                            return (
                              <button
                                key={mins}
                                onClick={() =>
                                  setSelectedPrepTimes((prev) => ({ ...prev, [order.id]: mins }))
                                }
                                className={`py-1 text-xs rounded-xl font-bold border transition ${
                                  isSelected
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {mins} mins
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleAcceptOrder(order.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl text-xs shadow-sm transition flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Accept</span>
                        </button>

                        <button
                          onClick={() => setRejectingOrder(order)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold px-3 py-2.5 rounded-xl text-xs transition"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Column 2: Preparing in Kitchen */}
          <div className="bg-slate-100/80 rounded-3xl p-4 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Cooking / Preparing
                </h2>
              </div>
              <span className="bg-blue-600 text-white text-xs font-black px-2.5 py-0.5 rounded-full">
                {preparingOrders.length}
              </span>
            </div>

            {preparingOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-300 text-slate-400 text-xs">
                No orders currently in the kitchen pan.
              </div>
            ) : (
              <div className="space-y-4">
                {preparingOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl p-4 shadow-md border border-slate-200 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-extrabold text-slate-900 text-sm block">
                          {order.orderNumber}
                        </span>
                        <span className="text-[11px] text-blue-600 font-bold">
                          Prep target: {order.prepTimeMinutes || 20} mins
                        </span>
                      </div>
                      <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                        Preparing
                      </span>
                    </div>

                    <div className="space-y-1.5 divide-y divide-slate-100">
                      {order.items.map((item) => (
                        <div key={item.id} className="pt-1.5 first:pt-0 flex items-start justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900">
                              {item.quantity}x {item.itemSnapshot.name}
                            </span>
                            {item.selectedModifiersSnapshot && item.selectedModifiersSnapshot.length > 0 && (
                              <div className="text-[11px] text-slate-500 pl-4 font-medium">
                                {item.selectedModifiersSnapshot.map((m) => m.name).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleMarkReady(order.id)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl text-xs shadow-md transition flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mark Food Ready</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 3: Ready for Courier Handover */}
          <div className="bg-slate-100/80 rounded-3xl p-4 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Ready for Handover
                </h2>
              </div>
              <span className="bg-emerald-600 text-white text-xs font-black px-2.5 py-0.5 rounded-full">
                {readyOrders.length}
              </span>
            </div>

            {readyOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-300 text-slate-400 text-xs">
                No orders waiting on the pickup counter.
              </div>
            ) : (
              <div className="space-y-4">
                {readyOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl p-4 shadow-md border border-emerald-200 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-extrabold text-slate-900 text-sm block">
                          {order.orderNumber}
                        </span>
                        <span className="text-[11px] text-emerald-700 font-bold">
                          Packed & On Counter
                        </span>
                      </div>
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                        Ready
                      </span>
                    </div>

                    {/* 4-Digit Pickup Handover OTP Badge */}
                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-900">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold">Pickup Code:</span>
                      </div>
                      <span className="text-base font-mono font-black tracking-widest text-emerald-700">
                        {order.delivery?.pickupOtp || '1234'}
                      </span>
                    </div>

                    {/* Assigned Courier Telemetry */}
                    {order.delivery?.rider ? (
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span className="flex items-center gap-1.5">
                            <Bike className="w-3.5 h-3.5 text-blue-600" />
                            {order.delivery.rider.name}
                          </span>
                          <span className="text-emerald-700">
                            {order.delivery.rider.ratingAverage || '4.90'} ★
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Vehicle: {order.delivery.rider.vehicleNumber} ({order.delivery.rider.vehicleType})
                        </p>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic text-center py-1">
                        Dispatching nearby couriers (30s offer broadcast)...
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: Menu & 86 Item Manager */}
      {/* ========================================================= */}
      {activeTab === 'menu' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Menu Items & 86 Availability Toggle
              </h2>
              <p className="text-xs text-slate-500">
                Instantly turn off items when out of ingredients. Changes reflect immediately on customer app.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {categories.map((category) => (
              <div
                key={category.id}
                className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4"
              >
                <h3 className="text-sm font-black text-slate-900 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span>{category.name}</span>
                  <span className="text-xs font-normal text-slate-500">
                    {category.items.length} items
                  </span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {category.items.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition flex items-center justify-between gap-3 ${
                        item.isAvailable
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50 border-rose-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {item.isVeg ? <GreenVegIcon /> : <RedNonVegIcon />}
                        <div>
                          <span
                            className={`font-bold text-xs block ${
                              item.isAvailable ? 'text-slate-900' : 'text-slate-500 line-through'
                            }`}
                          >
                            {item.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatPaiseToInr(item.pricePaise)}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleItemAvailability(item.id, item.isAvailable)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition ${
                          item.isAvailable
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                        }`}
                      >
                        {item.isAvailable ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>In Stock</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>86'd (Out)</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject Order Modal */}
      {rejectingOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-extrabold text-slate-900 text-base">Reject Order?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Rejecting order #{rejectingOrder.orderNumber} will notify the customer immediately and initiate an automatic refund.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Reason</label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white"
              >
                <option value="Kitchen overloaded with orders">Kitchen overloaded with orders</option>
                <option value="Out of key ingredients">Out of key ingredients</option>
                <option value="Kitchen closing early for maintenance">Kitchen closing early</option>
                <option value="High delivery delay in area">High delivery delay</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleRejectOrder}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition"
              >
                Confirm Reject
              </button>
              <button
                onClick={() => setRejectingOrder(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
