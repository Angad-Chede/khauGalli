'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  ChefHat,
  Bike,
  PackageCheck,
  AlertTriangle,
  XCircle,
  MapPin,
  RefreshCw,
  ShoppingBag,
  ShieldCheck,
  Navigation,
  Phone,
  Radio,
} from 'lucide-react';
import { formatPaiseToInr } from '@tiffin/shared';

interface OrderEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorRole: string;
  createdAt: string;
}

interface OrderItem {
  id: string;
  itemSnapshot: { name: string; basePricePaise: number };
  quantity: number;
  unitPricePaise: number;
  modifiersTotalPaise: number;
  lineTotalPaise: number;
  selectedModifiersSnapshot?: { name: string; pricePaise: number }[];
}

interface RiderInfo {
  id: string;
  name: string;
  phone: string;
  vehicleNumber: string;
  vehicleType: string;
  ratingAverage: string;
}

interface RiderLocation {
  latitude: number;
  longitude: number;
  heading: number;
  speedKmh: number;
  timestamp: string;
}

interface DeliveryDetails {
  id: string;
  status: string;
  distanceMeters: number;
  payoutPaise: number;
  rider?: RiderInfo | null;
  location?: RiderLocation | null;
  deliveryOtp?: string;
  pickupOtp?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  userId: string;
  restaurantId: string;
  status: string;
  paymentMode: string;
  subtotalPaise: number;
  taxPaise: number;
  deliveryFeePaise: number;
  platformFeePaise: number;
  packagingFeePaise: number;
  grandTotalPaise: number;
  prepTimeMinutes: number | null;
  cancellationReason: string | null;
  customerNotes: string | null;
  placedAt: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  restaurant?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  } | null;
  addressSnapshot?: any;
  items: OrderItem[];
  events: OrderEvent[];
  payment?: any;
  delivery?: DeliveryDetails | null;
}

const ORDER_STEPS = [
  { key: 'PLACED', label: 'Order Placed', icon: Clock },
  { key: 'PREPARING', label: 'Kitchen Preparing', icon: ChefHat },
  { key: 'READY', label: 'Food Ready', icon: PackageCheck },
  { key: 'PICKED_UP', label: 'Out for Delivery', icon: Bike },
  { key: 'DELIVERED', label: 'Delivered', icon: CheckCircle2 },
];

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('Changed my mind');
  const [isSseConnected, setIsSseConnected] = useState(false);
  const [liveLocation, setLiveLocation] = useState<RiderLocation | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Fetch full order state
  const fetchOrder = async () => {
    const token = localStorage.getItem('tiffin_token');
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setOrder(data.order);
        if (data.order?.delivery?.location) {
          setLiveLocation(data.order.delivery.location);
        }
      }
    } catch (err) {
      console.error('Failed to load order:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();

    // Setup native Server-Sent Events (SSE) stream
    const token = localStorage.getItem('tiffin_token');
    if (!token || !orderId) return;

    try {
      const sseUrl = `${apiUrl}/realtime/orders/${orderId}?token=${token}`;
      const sse = new EventSource(sseUrl);
      eventSourceRef.current = sse;

      sse.onopen = () => {
        setIsSseConnected(true);
      };

      sse.addEventListener('connected', () => {
        setIsSseConnected(true);
      });

      // Handle order status updates
      sse.addEventListener('order.update', () => {
        fetchOrder();
      });

      sse.addEventListener('order.event', () => {
        fetchOrder();
      });

      sse.addEventListener('delivery.assigned', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          setOrder((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              delivery: {
                ...(prev.delivery || {
                  id: payload.deliveryId,
                  status: 'ASSIGNED',
                  distanceMeters: 2000,
                  payoutPaise: 4000,
                }),
                rider: payload.rider,
              },
            };
          });
        } catch {
          fetchOrder();
        }
      });

      sse.addEventListener('order.picked_up', () => {
        fetchOrder();
      });

      sse.addEventListener('order.delivered', () => {
        fetchOrder();
      });

      // Live GPS rider location push
      sse.addEventListener('order.rider_location', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.location) {
            setLiveLocation(payload.location);
          }
        } catch {
          // Ignored
        }
      });

      sse.onerror = () => {
        setIsSseConnected(false);
        // On disconnect, refetch full state to catch up
        fetchOrder();
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
  }, [orderId]);

  const handleCancelOrder = async () => {
    const token = localStorage.getItem('tiffin_token');
    setIsCancelling(true);

    try {
      const res = await fetch(`${apiUrl}/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: cancellationReason }),
      });

      if (res.ok) {
        setShowCancelModal(false);
        fetchOrder();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to cancel order');
      }
    } catch {
      alert('Error cancelling order');
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-500 text-sm">
        Connecting to live order tracker...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900">Order Not Found</h2>
        <Link
          href="/customer"
          className="inline-block bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-2.5 rounded-2xl text-xs transition"
        >
          Return to Home
        </Link>
      </div>
    );
  }

  const isTerminalFailure = [
    'CANCELLED',
    'EXPIRED',
    'REJECTED_BY_RESTAURANT',
    'PAYMENT_FAILED',
    'FAILED_DELIVERY',
  ].includes(order.status);

  // Stepper active index
  const stepIndexMap: Record<string, number> = {
    CREATED: 0,
    PAYMENT_PENDING: 0,
    PLACED: 0,
    ACCEPTED: 1,
    PREPARING: 1,
    READY: 2,
    PICKED_UP: 3,
    DELIVERED: 4,
  };

  const currentStep = stepIndexMap[order.status] ?? 0;
  const isAssignedOrDelivering = ['READY', 'PICKED_UP', 'DELIVERED'].includes(order.status) || Boolean(order.delivery?.rider);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/customer"
            className="p-2 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">{order.orderNumber}</h1>
              {isSseConnected ? (
                <span className="flex items-center gap-1 text-[10px] font-black tracking-wider uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live SSE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-black tracking-wider uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  Connecting...
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500 font-semibold">
              {order.restaurant?.name || 'Restaurant'} • {order.paymentMode}
            </span>
          </div>
        </div>

        <button
          onClick={fetchOrder}
          className="p-2 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          title="Refresh State"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Terminal State Alert (Cancelled / Expired / Rejected) */}
      {isTerminalFailure ? (
        <div className="bg-rose-50 border border-rose-300 rounded-3xl p-6 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <XCircle className="w-7 h-7" />
          </div>
          <h2 className="text-base font-extrabold text-rose-950 uppercase tracking-wider">
            {order.status === 'EXPIRED' && 'Order Expired'}
            {order.status === 'REJECTED_BY_RESTAURANT' && 'Rejected by Kitchen'}
            {order.status === 'CANCELLED' && 'Order Cancelled'}
            {order.status === 'PAYMENT_FAILED' && 'Payment Failed'}
          </h2>
          <p className="text-xs text-rose-700 leading-relaxed max-w-sm mx-auto">
            {order.cancellationReason || 'This order was terminated and will not be prepared.'}
          </p>
          {order.paymentMode === 'ONLINE' && (
            <span className="inline-block bg-white border border-rose-200 text-rose-800 text-[11px] font-bold px-3 py-1 rounded-full mt-2">
              Refund initiated to your original payment method
            </span>
          )}
        </div>
      ) : (
        /* Live Status Stepper */
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <span className="text-xs font-black text-slate-900 block uppercase tracking-wider">
                Live Status
              </span>
              <span className="text-xs text-slate-500">
                {order.status === 'PLACED' && 'Waiting for kitchen to accept your order...'}
                {order.status === 'ACCEPTED' && 'Order accepted! Cooking will begin shortly.'}
                {order.status === 'PREPARING' && `Kitchen is preparing your dishes (Est: ${order.prepTimeMinutes || 20}m)`}
                {order.status === 'READY' && 'Food is packed! Dispatching nearby delivery partner.'}
                {order.status === 'PICKED_UP' && 'Rider has picked up food and is on the way!'}
                {order.status === 'DELIVERED' && 'Order successfully delivered. Enjoy your meal!'}
              </span>
            </div>

            <span className="bg-emerald-50 text-emerald-700 border border-emerald-300 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
              {order.status}
            </span>
          </div>

          {/* Stepper Dots */}
          <div className="grid grid-cols-5 gap-2 text-center pt-2">
            {ORDER_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isDone = idx <= currentStep;
              const isCurrent = idx === currentStep;

              return (
                <div key={step.key} className="space-y-1.5 flex flex-col items-center">
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center transition shadow-xs ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    } ${isCurrent ? 'ring-4 ring-emerald-100' : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-[10px] leading-tight font-bold ${
                      isDone ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Customer Cancel Button (Only enabled in PLACED state) */}
          {order.status === 'PLACED' && (
            <div className="pt-3 border-t border-slate-100 text-center">
              <button
                onClick={() => setShowCancelModal(true)}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline"
              >
                Cancel Order (Before Kitchen Accepts)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delivery Confirmation OTP Card (Prominent display for customer) */}
      {!isTerminalFailure && order.delivery?.deliveryOtp && order.status !== 'DELIVERED' && (
        <div className="bg-gradient-to-r from-orange-500 to-amber-600 rounded-3xl p-6 text-white shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-xs uppercase font-black tracking-wider">
                Delivery Confirmation Code
              </span>
            </div>
            <span className="text-[10px] bg-white/20 font-bold px-2 py-0.5 rounded-full">
              4 Digits
            </span>
          </div>

          <div className="text-center py-2">
            <div className="text-4xl font-mono font-black tracking-widest text-white drop-shadow-sm">
              {order.delivery.deliveryOtp}
            </div>
            <p className="text-xs text-orange-100 mt-1">
              Please share this code with your delivery partner only when you receive your food package.
            </p>
          </div>
        </div>
      )}

      {/* Assigned Delivery Partner Card */}
      {order.delivery?.rider && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Bike className="w-4 h-4 text-orange-600" />
              Delivery Partner Assigned
            </span>
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
              {order.delivery.rider.ratingAverage || '4.90'} ★
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                {order.delivery.rider.name}
              </h3>
              <p className="text-xs text-slate-500">
                Vehicle: {order.delivery.rider.vehicleNumber} ({order.delivery.rider.vehicleType})
              </p>
            </div>

            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Phone className="w-4 h-4" />
            </div>
          </div>

          {/* Live GPS Telemetry if rider is on the road */}
          {liveLocation && order.status === 'PICKED_UP' && (
            <div className="bg-blue-50 rounded-2xl p-3 border border-blue-200 text-xs text-blue-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-600 animate-pulse" />
                <span>Rider on route: {liveLocation.speedKmh} km/h</span>
              </div>
              <span className="text-[11px] font-mono text-blue-700">
                {liveLocation.latitude.toFixed(4)}, {liveLocation.longitude.toFixed(4)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Delivery Address */}
      {order.addressSnapshot && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-2">
          <div className="flex items-center gap-2 text-slate-900 font-black text-xs uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-orange-600" />
            <span>Delivering To</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {order.addressSnapshot.line1}
            {order.addressSnapshot.landmark && `, near ${order.addressSnapshot.landmark}`}
            {order.addressSnapshot.city && `, ${order.addressSnapshot.city}`}
          </p>
        </div>
      )}

      {/* Ordered Dishes Summary */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
          Items Ordered ({order.items.length})
        </h2>

        <div className="space-y-2.5 divide-y divide-slate-100">
          {order.items.map((item) => (
            <div key={item.id} className="pt-2 first:pt-0 flex items-start justify-between text-xs">
              <div>
                <span className="font-bold text-slate-900">
                  {item.quantity}x {item.itemSnapshot.name}
                </span>
                {item.selectedModifiersSnapshot && item.selectedModifiersSnapshot.length > 0 && (
                  <div className="text-[11px] text-slate-500 pl-4">
                    {item.selectedModifiersSnapshot.map((m) => m.name).join(', ')}
                  </div>
                )}
              </div>
              <span className="text-slate-700 font-bold">
                {formatPaiseToInr(item.lineTotalPaise)}
              </span>
            </div>
          ))}
        </div>

        {/* Bill Breakdown */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Item Subtotal</span>
            <span>{formatPaiseToInr(order.subtotalPaise)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Food GST (5%)</span>
            <span>{formatPaiseToInr(order.taxPaise)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Delivery Fee</span>
            <span>{formatPaiseToInr(order.deliveryFeePaise)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Platform Fee</span>
            <span>{formatPaiseToInr(order.platformFeePaise)}</span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-sm text-slate-900">
            <span>Total Paid</span>
            <span className="text-orange-600">{formatPaiseToInr(order.grandTotalPaise)}</span>
          </div>
        </div>
      </div>

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-extrabold text-slate-900 text-base">Cancel Order?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to cancel this order? Since the kitchen has not accepted it yet, you will receive a full refund.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Reason</label>
              <select
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white"
              >
                <option value="Changed my mind">Changed my mind</option>
                <option value="Ordered by mistake">Ordered by mistake</option>
                <option value="Delivery address incorrect">Delivery address incorrect</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                disabled={isCancelling}
                onClick={handleCancelOrder}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition"
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition"
              >
                Keep Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
