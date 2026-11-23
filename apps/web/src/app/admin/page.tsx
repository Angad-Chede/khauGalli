'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Activity,
  Users,
  Store,
  DollarSign,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Percent,
  MapPin,
  FileText,
  Sliders,
  XCircle,
  TrendingUp,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { formatPaiseToInr } from '@tiffin/shared';

interface LiveOpsData {
  activeOrdersCount: number;
  stuckOrdersCount: number;
  stuckOrders: {
    id: string;
    orderNumber: string;
    restaurantName: string;
    status: string;
    grandTotalPaise: number;
    ageSeconds: number;
    isStuck: boolean;
    stuckReason: string;
  }[];
  couriers: {
    totalRegistered: number;
    onlineCount: number;
    busyCount: number;
    idleCount: number;
  };
  restaurants: {
    totalRegistered: number;
    acceptingOrdersCount: number;
    pausedCount: number;
  };
  finance: {
    todayGmvPaise: number;
    completedRevenuePaise: number;
    platformCommissionPaise: number;
    totalOrdersPlacedToday: number;
    totalDeliveredToday: number;
  };
}

interface RestaurantRecord {
  id: string;
  name: string;
  slug: string;
  cuisineTypes: string[];
  ratingAverage: string;
  ratingCount: number;
  commissionBps: number;
  commissionPercent: string;
  status: 'APPROVED' | 'SUSPENDED';
  isOpen: boolean;
  acceptingOrders: boolean;
  totalOrders: number;
  completedOrders: number;
  grossPaise: number;
}

interface ServiceZoneRecord {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  boundary: any;
}

interface SettlementRecord {
  restaurantId: string;
  restaurantName: string;
  commissionBps: number;
  commissionPercent: string;
  ordersCount: number;
  grossSubtotalPaise: number;
  grossTaxPaise: number;
  platformCommissionPaise: number;
  netMerchantPayablePaise: number;
}

interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  diff: any;
  createdAt: string;
}

export default function AdminConsole() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'liveops' | 'restaurants' | 'zones' | 'settlements' | 'audit'>('liveops');
  const [liveOps, setLiveOps] = useState<LiveOpsData | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantRecord[]>([]);
  const [zones, setZones] = useState<ServiceZoneRecord[]>([]);
  const [settlements, setSettlements] = useState<{ totals: any; restaurants: SettlementRecord[] } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editingCommission, setEditingCommission] = useState<Record<string, number>>({});

  useEffect(() => {
    ensureAdminAuth().then((tok) => {
      if (tok) {
        fetchAllData(tok);
      }
    });
  }, []);

  const ensureAdminAuth = async () => {
    let storedToken = localStorage.getItem('tiffin_admin_token');
    if (!storedToken) {
      try {
        // Auto-login as Meera Sundaram (Marketplace Super-Admin)
        await fetch(`${apiUrl}/auth/request-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '+919999900004' }),
        });

        const verifyRes = await fetch(`${apiUrl}/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '+919999900004', code: '123456' }),
        });

        if (verifyRes.ok) {
          const data = await verifyRes.json();
          localStorage.setItem('tiffin_admin_token', data.token);
          setToken(data.token);
          return data.token;
        }
      } catch (err) {
        console.error('Failed to auto-authenticate admin:', err);
      }
    } else {
      setToken(storedToken);
      return storedToken;
    }
    return null;
  };

  const fetchAllData = async (tok: string) => {
    setIsLoading(true);
    await Promise.all([
      fetchLiveOps(tok),
      fetchRestaurants(tok),
      fetchZones(tok),
      fetchSettlements(tok),
      fetchAuditLogs(tok),
    ]);
    setIsLoading(false);
  };

  const fetchLiveOps = async (tok = token) => {
    if (!tok) return;
    try {
      const res = await fetch(`${apiUrl}/admin/live-ops`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLiveOps(data);
      }
    } catch {
      // Background retry
    }
  };

  const fetchRestaurants = async (tok = token) => {
    if (!tok) return;
    try {
      const res = await fetch(`${apiUrl}/admin/restaurants`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRestaurants(data.restaurants || []);
        const initComm: Record<string, number> = {};
        for (const r of data.restaurants || []) {
          initComm[r.id] = r.commissionBps / 100;
        }
        setEditingCommission(initComm);
      }
    } catch {
      // Ignored
    }
  };

  const fetchZones = async (tok = token) => {
    if (!tok) return;
    try {
      const res = await fetch(`${apiUrl}/admin/zones`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones || []);
      }
    } catch {
      // Ignored
    }
  };

  const fetchSettlements = async (tok = token) => {
    if (!tok) return;
    try {
      const res = await fetch(`${apiUrl}/admin/settlements`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSettlements(data);
      }
    } catch {
      // Ignored
    }
  };

  const fetchAuditLogs = async (tok = token) => {
    if (!tok) return;
    try {
      const res = await fetch(`${apiUrl}/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch {
      // Ignored
    }
  };

  const handleUpdateCommission = async (restaurantId: string) => {
    if (!token) return;
    const percent = editingCommission[restaurantId] || 20;
    const bps = Math.round(percent * 100);

    try {
      const res = await fetch(`${apiUrl}/admin/restaurants/${restaurantId}/commission`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ commissionBps: bps }),
      });

      if (res.ok) {
        showToast(`Commission updated to ${percent}% with immutable audit log.`);
        fetchRestaurants();
        fetchAuditLogs();
        fetchSettlements();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update commission');
      }
    } catch {
      alert('Network error updating commission');
    }
  };

  const handleToggleRestaurantStatus = async (restaurantId: string, currentStatus: string) => {
    if (!token) return;
    const nextStatus = currentStatus === 'APPROVED' ? 'SUSPENDED' : 'APPROVED';

    try {
      const res = await fetch(`${apiUrl}/admin/restaurants/${restaurantId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: nextStatus,
          reason: `Admin manual status toggle to ${nextStatus}`,
        }),
      });

      if (res.ok) {
        showToast(`Restaurant status changed to ${nextStatus}.`);
        fetchRestaurants();
        fetchAuditLogs();
      } else {
        alert('Failed to update restaurant status');
      }
    } catch {
      alert('Error updating status');
    }
  };

  const handleToggleZone = async (zoneId: string, currentVal: boolean) => {
    if (!token) return;
    const nextVal = !currentVal;

    try {
      const res = await fetch(`${apiUrl}/admin/zones/${zoneId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: nextVal }),
      });

      if (res.ok) {
        showToast(`Service zone ${nextVal ? 'activated' : 'paused'}.`);
        fetchZones();
        fetchAuditLogs();
      } else {
        alert('Failed to toggle service zone');
      }
    } catch {
      alert('Error updating zone');
    }
  };

  const handleIntervene = async (orderId: string, action: 'CANCEL_AND_REFUND' | 'REDISPATCH_COURIER') => {
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/admin/orders/${orderId}/intervene`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          reason: 'Meera (Admin) operational intervention on stuck order',
        }),
      });

      if (res.ok) {
        showToast(`Intervention executed: ${action}`);
        fetchLiveOps();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to intervene on order');
      }
    } catch {
      alert('Error executing intervention');
    }
  };

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center text-xs font-semibold text-purple-600 tracking-wider uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 mr-2" />
            Persona: Meera Sundaram (Marketplace Super-Admin)
          </div>
          <h1 className="text-2xl font-black text-slate-900">Platform Control Center</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-Time Live Ops • Commission Management • PostGIS Geozones • Financial Settlements • Audit Trails
          </p>
        </div>

        <button
          onClick={() => token && fetchAllData(token)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2.5 rounded-2xl text-xs shadow-sm transition"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh All Metrics</span>
        </button>
      </div>

      {/* Toast Notification */}
      {statusMessage && (
        <div className="bg-slate-900 text-white text-xs px-4 py-3 rounded-2xl shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('liveops')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition shrink-0 ${
            activeTab === 'liveops'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Live Ops & Watchdog</span>
          {liveOps && liveOps.stuckOrdersCount > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
              {liveOps.stuckOrdersCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('restaurants')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition shrink-0 ${
            activeTab === 'restaurants'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Restaurants & Commissions</span>
        </button>

        <button
          onClick={() => setActiveTab('zones')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition shrink-0 ${
            activeTab === 'zones'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Service Geozones</span>
        </button>

        <button
          onClick={() => setActiveTab('settlements')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition shrink-0 ${
            activeTab === 'settlements'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Settlements & Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition shrink-0 ${
            activeTab === 'audit'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Log Stream</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: Live Ops & Watchdog */}
      {/* ========================================================= */}
      {activeTab === 'liveops' && (
        <div className="space-y-6">
          {/* Key KPI Tiles */}
          {liveOps && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Active Orders</span>
                  <Activity className="w-4 h-4 text-orange-500" />
                </div>
                <div className="text-2xl font-black text-slate-900">{liveOps.activeOrdersCount}</div>
                <span className="text-[11px] text-slate-500">
                  {liveOps.stuckOrdersCount > 0 ? (
                    <span className="text-rose-600 font-bold">{liveOps.stuckOrdersCount} stuck (&gt;3m)</span>
                  ) : (
                    <span className="text-emerald-600 font-bold">0 stuck orders</span>
                  )}
                </span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Active Couriers</span>
                  <Users className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-black text-slate-900">{liveOps.couriers.onlineCount}</div>
                <span className="text-[11px] text-slate-500">
                  {liveOps.couriers.busyCount} busy • {liveOps.couriers.idleCount} idle
                </span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Live Restaurants</span>
                  <Store className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {liveOps.restaurants.acceptingOrdersCount}
                </div>
                <span className="text-[11px] text-emerald-600 font-bold">
                  {liveOps.restaurants.pausedCount} paused
                </span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Today's Platform Cut</span>
                  <DollarSign className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl font-black text-purple-700">
                  {formatPaiseToInr(liveOps.finance.platformCommissionPaise)}
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  GMV: {formatPaiseToInr(liveOps.finance.todayGmvPaise)}
                </span>
              </div>
            </div>
          )}

          {/* Stuck Orders Watchdog Alert Panel */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <h2 className="text-base font-black text-slate-900">
                  Stuck-Orders Watchdog (SLA Guard)
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                Auto-flags orders exceeding 3-min acceptance or 5-min counter dwell
              </span>
            </div>

            {liveOps && liveOps.stuckOrders.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center text-xs text-emerald-800 flex items-center justify-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>All active orders are within operational SLAs. No stuck orders detected.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {liveOps?.stuckOrders.map((stuck) => (
                  <div
                    key={stuck.id}
                    className="bg-rose-50/70 border border-rose-300 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900">{stuck.orderNumber}</span>
                        <span className="bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                          {stuck.status}
                        </span>
                        <span className="text-slate-600 font-bold">{stuck.restaurantName}</span>
                      </div>
                      <p className="text-rose-700 mt-1">{stuck.stuckReason}</p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleIntervene(stuck.id, 'CANCEL_AND_REFUND')}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-xl transition"
                      >
                        Force Cancel & Refund
                      </button>
                      <button
                        onClick={() => handleIntervene(stuck.id, 'REDISPATCH_COURIER')}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl transition"
                      >
                        Re-dispatch Courier
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: Restaurants & Commission Governance */}
      {/* ========================================================= */}
      {activeTab === 'restaurants' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">Partner Restaurant Governance</h2>
              <p className="text-xs text-slate-500">
                Adjust tiered platform commissions and manage merchant onboarding statuses. Changes are audit-logged.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Restaurant</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Rating</th>
                  <th className="py-3 px-4">Commission % (Tier)</th>
                  <th className="py-3 px-4">Delivered Orders</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {restaurants.map((rest) => (
                  <tr key={rest.id} className="hover:bg-slate-50/50">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {rest.name}
                      <span className="block text-[11px] text-slate-400 font-normal">
                        {rest.cuisineTypes.join(', ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          rest.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {rest.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-700">
                      {rest.ratingAverage} ★
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="50"
                          value={editingCommission[rest.id] ?? 20}
                          onChange={(e) =>
                            setEditingCommission((prev) => ({
                              ...prev,
                              [rest.id]: parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="w-20 px-2 py-1 rounded-xl border border-slate-300 font-mono text-center font-bold"
                        />
                        <span className="font-bold text-slate-500">%</span>
                        <button
                          onClick={() => handleUpdateCommission(rest.id)}
                          className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-2.5 py-1 rounded-xl text-[11px] transition"
                        >
                          Save
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-700">
                      {rest.completedOrders} orders
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleToggleRestaurantStatus(rest.id, rest.status)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-[11px] border transition ${
                          rest.status === 'APPROVED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {rest.status === 'APPROVED' ? 'Suspend' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: Service Geozones */}
      {/* ========================================================= */}
      {activeTab === 'zones' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">PostGIS Delivery Service Zones</h2>
              <p className="text-xs text-slate-500">
                Polygons defining operational coverage clusters. Coordinates are validated with PostGIS ST_Contains.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">{zone.name}</h3>
                    <span className="text-[11px] text-slate-500">
                      Status:{' '}
                      <span className={zone.isActive ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                        {zone.isActive ? 'Active Coverage' : 'Paused'}
                      </span>
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggleZone(zone.id, zone.isActive)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs border transition ${
                      zone.isActive
                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    {zone.isActive ? 'Pause Zone' : 'Activate Zone'}
                  </button>
                </div>

                <div className="bg-white rounded-xl p-3 border border-slate-200 font-mono text-[11px] text-slate-600 space-y-1">
                  <span className="font-bold text-slate-800 block text-[10px] uppercase">
                    Boundary Polygon (WGS-84 Coordinates):
                  </span>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Indiranagar (77.64, 12.97) • Koramangala (77.62, 12.93) • MG Road CBD (77.60, 12.97)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: Settlements & Ledger */}
      {/* ========================================================= */}
      {activeTab === 'settlements' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">Financial Settlements Ledger</h2>
              <p className="text-xs text-slate-500">
                Breakdown of food sales subtotal, platform commission deducted, and net merchant payouts.
              </p>
            </div>
          </div>

          {settlements && (
            <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block">Gross Food Sales</span>
                <span className="text-lg font-black text-slate-900">
                  {formatPaiseToInr(settlements.totals.totalGrossPaise)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Platform Commission Earned</span>
                <span className="text-lg font-black text-purple-700">
                  {formatPaiseToInr(settlements.totals.totalCommissionPaise)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Net Merchant Payable</span>
                <span className="text-lg font-black text-emerald-700">
                  {formatPaiseToInr(settlements.totals.totalMerchantPayablePaise)}
                </span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Merchant</th>
                  <th className="py-3 px-4">Commission %</th>
                  <th className="py-3 px-4">Orders</th>
                  <th className="py-3 px-4">Gross Sales</th>
                  <th className="py-3 px-4">Platform Cut</th>
                  <th className="py-3 px-4 text-right">Net Merchant Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements?.restaurants.map((row) => (
                  <tr key={row.restaurantId} className="hover:bg-slate-50/50">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{row.restaurantName}</td>
                    <td className="py-3.5 px-4 font-bold text-purple-700">{row.commissionPercent}</td>
                    <td className="py-3.5 px-4 text-slate-600">{row.ordersCount}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {formatPaiseToInr(row.grossSubtotalPaise)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-purple-700">
                      {formatPaiseToInr(row.platformCommissionPaise)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-emerald-700">
                      {formatPaiseToInr(row.netMerchantPayablePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: Audit Log Stream */}
      {/* ========================================================= */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">Immutable Audit Log Stream</h2>
              <p className="text-xs text-slate-500">
                Cryptographic audit trail tracking all administrator actions, commission changes, and state interventions.
              </p>
            </div>
          </div>

          <div className="space-y-2 divide-y divide-slate-100">
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No audit entries recorded yet. System mutations will appear here automatically.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="pt-3 first:pt-0 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                        {log.action}
                      </span>
                      <span className="text-slate-500">by</span>
                      <span className="font-bold text-purple-700">{log.actorName}</span>
                    </div>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {log.diff && (
                    <div className="bg-slate-50 rounded-xl p-2.5 font-mono text-[11px] text-slate-600 border border-slate-200">
                      {JSON.stringify(log.diff)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
