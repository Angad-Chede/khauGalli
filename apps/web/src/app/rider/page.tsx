'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Bike,
  MapPin,
  DollarSign,
  Power,
  Navigation,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Compass,
  Store,
  Home,
  RefreshCw,
} from 'lucide-react';
import { formatPaiseToInr } from '@tiffin/shared';

interface DeliveryOffer {
  id: string;
  deliveryId: string;
  payoutPaise: number;
  distanceMeters: number;
  expiresAt: string;
}

interface ActiveDelivery {
  id: string;
  orderId: string;
  status: 'ASSIGNED' | 'ARRIVED_AT_STORE' | 'PICKED_UP' | 'ARRIVED_AT_CUSTOMER' | 'DELIVERED';
  distanceMeters: number;
  payoutPaise: number;
  pickupOtp?: string;
  deliveryOtp?: string;
  order?: {
    orderNumber: string;
    grandTotalPaise: number;
    items?: any[];
  };
  restaurant?: {
    name: string;
    addressSnapshot?: any;
  };
}

export default function RiderDashboard() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const [isOnline, setIsOnline] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [offers, setOffers] = useState<DeliveryOffer[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<ActiveDelivery | null>(null);
  const [pickupInputOtp, setPickupInputOtp] = useState('');
  const [deliveryInputOtp, setDeliveryInputOtp] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSimulatingGps, setIsSimulatingGps] = useState(false);
  const [simStep, setSimStep] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Initialize or fetch demo token for Imran Khan
  useEffect(() => {
    let storedToken = localStorage.getItem('tiffin_rider_token');
    if (!storedToken) {
      // Auto-login as Imran Khan (Rider Persona)
      loginAsImran();
    } else {
      setToken(storedToken);
    }
  }, []);

  const loginAsImran = async () => {
    try {
      // 1. Request OTP for demo rider Imran (+919999900003)
      await fetch(`${apiUrl}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+919999900003' }),
      });

      // 2. Verify with standard demo OTP '123456'
      const verifyRes = await fetch(`${apiUrl}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+919999900003', code: '123456' }),
      });

      if (verifyRes.ok) {
        const data = await verifyRes.json();
        localStorage.setItem('tiffin_rider_token', data.token);
        setToken(data.token);
      }
    } catch (err) {
      console.error('Failed to authenticate demo rider:', err);
    }
  };

  // Poll / sync state when token is ready
  useEffect(() => {
    if (!token) return;

    fetchActiveDelivery();
    fetchOffers();

    const interval = setInterval(() => {
      fetchActiveDelivery();
      fetchOffers();
    }, 4000);

    return () => clearInterval(interval);
  }, [token]);

  // Connect to SSE stream for instantaneous offer notifications
  useEffect(() => {
    if (!token || !isOnline) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    try {
      const sse = new EventSource(`${apiUrl}/realtime/rider/offers?token=${token}`);
      eventSourceRef.current = sse;

      sse.addEventListener('delivery.offer', (event: MessageEvent) => {
        try {
          const offer = JSON.parse(event.data);
          setOffers((prev) => {
            const exists = prev.some((o) => o.id === offer.offerId);
            if (exists) return prev;
            return [
              {
                id: offer.offerId,
                deliveryId: offer.deliveryId,
                payoutPaise: offer.payoutPaise,
                distanceMeters: offer.distanceMeters,
                expiresAt: offer.expiresAt,
              },
              ...prev,
            ];
          });
        } catch (e) {
          console.error('Failed to parse SSE offer:', e);
        }
      });

      sse.onerror = () => {
        // EventSource automatically retries on disconnect
      };
    } catch (err) {
      console.error('SSE initialization error:', err);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [token, isOnline]);

  const fetchActiveDelivery = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/rider/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActiveDelivery(data.activeDelivery || null);
      }
    } catch {
      // Ignored
    }
  };

  const fetchOffers = async () => {
    if (!token || !isOnline) return;
    try {
      const res = await fetch(`${apiUrl}/rider/offers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
      }
    } catch {
      // Ignored
    }
  };

  const handleToggleOnline = async () => {
    if (!token) return;
    const nextState = !isOnline;
    try {
      const res = await fetch(`${apiUrl}/rider/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isOnline: nextState }),
      });
      if (res.ok) {
        setIsOnline(nextState);
        if (!nextState) setOffers([]);
      }
    } catch {
      alert('Failed to update online status');
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    if (!token) return;
    setActionError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`${apiUrl}/rider/offers/${offerId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        setOffers([]);
        await fetchActiveDelivery();
        setActionSuccess('Offer accepted! Ride safely to restaurant.');
        setTimeout(() => setActionSuccess(null), 4000);
      } else {
        const err = await res.json();
        setActionError(err.error || 'Failed to accept offer. It may have expired or been taken.');
      }
    } catch {
      setActionError('Network error accepting offer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPickup = async () => {
    if (!token || !activeDelivery) return;
    setActionError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`${apiUrl}/rider/deliveries/${activeDelivery.id}/pickup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ otp: pickupInputOtp.trim() }),
      });

      if (res.ok) {
        setPickupInputOtp('');
        await fetchActiveDelivery();
        setActionSuccess('Food pickup verified! Head to customer dropoff address.');
        setTimeout(() => setActionSuccess(null), 4000);
      } else {
        const err = await res.json();
        setActionError(err.error || 'Invalid 4-digit Pickup OTP. Check with kitchen lead.');
      }
    } catch {
      setActionError('Network error confirming pickup');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!token || !activeDelivery) return;
    setActionError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`${apiUrl}/rider/deliveries/${activeDelivery.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ otp: deliveryInputOtp.trim() }),
      });

      if (res.ok) {
        setDeliveryInputOtp('');
        setActiveDelivery(null);
        setActionSuccess('Order delivered successfully! Payout credited to your wallet.');
        setTimeout(() => setActionSuccess(null), 5000);
      } else {
        const err = await res.json();
        setActionError(err.error || 'Invalid 4-digit Delivery OTP. Ask customer for the code.');
      }
    } catch {
      setActionError('Network error completing delivery');
    } finally {
      setIsSubmitting(false);
    }
  };

  // GPS Simulation: simulate bike motion from Indiranagar to Koramangala
  const simulateGpsStep = async () => {
    if (!token) return;
    setIsSimulatingGps(true);

    // Route coordinates: Indiranagar 100ft Rd -> Domlur Flyover -> Koramangala 80ft Rd
    const waypoints = [
      { lat: 12.9716, lng: 77.6412, heading: 180, speed: 28.5 },
      { lat: 12.9650, lng: 77.6380, heading: 200, speed: 32.0 },
      { lat: 12.9550, lng: 77.6320, heading: 210, speed: 35.0 },
      { lat: 12.9420, lng: 77.6250, heading: 195, speed: 25.0 },
      { lat: 12.9352, lng: 77.6245, heading: 180, speed: 15.0 },
    ];

    const nextIdx = (simStep + 1) % waypoints.length;
    setSimStep(nextIdx);
    const pt = waypoints[nextIdx];

    try {
      await fetch(`${apiUrl}/rider/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          latitude: pt.lat,
          longitude: pt.lng,
          heading: pt.heading,
          speed: pt.speed,
        }),
      });

      setActionSuccess(`GPS ping broadcasted: ${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)} (${pt.speed} km/h)`);
      setTimeout(() => setActionSuccess(null), 2500);
    } catch {
      // Ignored
    } finally {
      setIsSimulatingGps(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center text-xs font-semibold text-blue-600 tracking-wider uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
            Persona: Imran Khan (Delivery Partner)
          </div>
          <h1 className="text-2xl font-black text-slate-900">Rider Partner Console</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Vehicle: 2-Wheeler (KA-01-EQ-4821) • Bengaluru Central Zone
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchActiveDelivery}
            className="p-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh State"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleToggleOnline}
            className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded-2xl text-xs shadow-sm transition ${
              isOnline
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isOnline ? 'Online (Accepting Offers)' : 'Offline (Paused)'}</span>
          </button>
        </div>
      </div>

      {/* Action Alerts */}
      {actionError && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex items-center gap-3 text-rose-800 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center gap-3 text-emerald-800 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Earnings Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Today's Earnings</span>
          <div className="text-2xl font-black text-slate-900 mt-1">₹740.00</div>
          <span className="text-[11px] text-emerald-600 font-bold">9 trips completed</span>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Weekly Total</span>
          <div className="text-2xl font-black text-slate-900 mt-1">₹5,180.00</div>
          <span className="text-[11px] text-slate-500 font-medium">Fuel bonus: ₹450.00</span>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Partner Rating</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">4.92 ★</div>
          <span className="text-[11px] text-slate-500 font-medium">96% on-time rate</span>
        </div>
      </div>

      {/* Incoming Offers (Broadcasted via SSE & 30s Countdown) */}
      {offers.length > 0 && !activeDelivery && (
        <div className="space-y-3">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping" />
            Incoming Delivery Offers ({offers.length})
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {offers.map((offer) => (
              <div
                key={offer.id}
                className="bg-orange-50/70 border-2 border-orange-400 rounded-3xl p-5 shadow-sm space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-wider text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                      30s Dispatch Offer
                    </span>
                    <h3 className="text-lg font-black text-slate-900 mt-1">
                      {formatPaiseToInr(offer.payoutPaise)} Payout
                    </h3>
                    <p className="text-xs text-slate-600">
                      Distance: {(offer.distanceMeters / 1000).toFixed(1)} km road trip
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-black">
                    <Bike className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white/80 rounded-2xl p-3 border border-orange-200 text-xs text-slate-600 flex justify-between items-center">
                  <span>Pickup: Khau Galli Street Kitchen</span>
                  <span className="font-bold text-orange-700">Indiranagar</span>
                </div>

                <button
                  disabled={isSubmitting}
                  onClick={() => handleAcceptOffer(offer.id)}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-2xl text-xs transition shadow-sm flex items-center justify-center gap-2"
                >
                  <span>Accept Delivery</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Delivery Flow */}
      {activeDelivery ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-start pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs uppercase font-black tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Active Assignment: {activeDelivery.status}
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-2">
                Order #{activeDelivery.order?.orderNumber || '101'}
              </h2>
              <span className="text-xs text-slate-500">
                Trip Payout: {formatPaiseToInr(activeDelivery.payoutPaise)} • Distance:{' '}
                {(activeDelivery.distanceMeters / 1000).toFixed(1)} km
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={simulateGpsStep}
                disabled={isSimulatingGps}
                className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-2 rounded-2xl text-xs border border-blue-200 transition"
                title="Broadcast next GPS waypoint to Redis/SSE stream"
              >
                <Compass className={`w-4 h-4 ${isSimulatingGps ? 'animate-spin' : ''}`} />
                <span>Simulate GPS Move</span>
              </button>
            </div>
          </div>

          {/* Stage 1: Pickup Handover */}
          {activeDelivery.status === 'ASSIGNED' || activeDelivery.status === 'ARRIVED_AT_STORE' ? (
            <div className="bg-slate-50 rounded-3xl p-5 border border-slate-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Stage 1: Pickup from Restaurant</h3>
                  <p className="text-xs text-slate-500">
                    Khau Galli Chaats & Street Food • 100ft Road, Indiranagar
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-slate-800">4-Digit Pickup Handover OTP</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ask the kitchen lead for their 4-digit pickup code before loading food into the thermal bag.
                    {activeDelivery.pickupOtp && (
                      <span className="ml-1 text-emerald-700 font-bold">
                        (Demo Code: {activeDelivery.pickupOtp})
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Enter 4-digit OTP"
                    value={pickupInputOtp}
                    onChange={(e) => setPickupInputOtp(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-mono tracking-widest text-center"
                  />
                  <button
                    disabled={pickupInputOtp.length !== 4 || isSubmitting}
                    onClick={handleConfirmPickup}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black px-6 py-2.5 rounded-xl text-xs transition"
                  >
                    Confirm Pickup
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Stage 2: Customer Dropoff */}
          {activeDelivery.status === 'PICKED_UP' || activeDelivery.status === 'ARRIVED_AT_CUSTOMER' ? (
            <div className="bg-emerald-50/50 rounded-3xl p-5 border border-emerald-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
                  <Home className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Stage 2: Customer Dropoff</h3>
                  <p className="text-xs text-slate-500">
                    Deliver to Asha Mukherjee • 4th Block, Koramangala
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-slate-800">4-Digit Customer Delivery OTP</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Customer has the delivery confirmation code on their live tracking screen.
                    {activeDelivery.deliveryOtp && (
                      <span className="ml-1 text-emerald-700 font-bold">
                        (Demo Code: {activeDelivery.deliveryOtp})
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Enter 4-digit OTP"
                    value={deliveryInputOtp}
                    onChange={(e) => setDeliveryInputOtp(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-mono tracking-widest text-center"
                  />
                  <button
                    disabled={deliveryInputOtp.length !== 4 || isSubmitting}
                    onClick={handleConfirmDelivery}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black px-6 py-2.5 rounded-xl text-xs transition"
                  >
                    Complete Delivery
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        /* Standby Card */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Navigation className="w-7 h-7 animate-pulse" />
          </div>
          <h3 className="text-base font-black text-slate-900">
            {isOnline ? 'Online & Waiting for Orders' : 'You are currently offline'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {isOnline
              ? 'Realtime SSE gateway is active. When an order is marked READY by a kitchen in Bengaluru Central, a 30-second dispatch card will pop up here instantly.'
              : 'Toggle your status to Online above to start receiving delivery offers in Bengaluru Central.'}
          </p>
        </div>
      )}
    </div>
  );
}
