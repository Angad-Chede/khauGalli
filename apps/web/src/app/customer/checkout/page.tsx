'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Banknote,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';
import { formatPaiseToInr, generateUuidV7 } from '@tiffin/shared';

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<any | null>(null);
  const [quote, setQuote] = useState<any | null>(null);
  const [paymentMode, setPaymentMode] = useState<'ONLINE' | 'COD'>('ONLINE');
  const [customerNotes, setCustomerNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [priceChangedError, setPriceChangedError] = useState<any | null>(null);
  const [onlineMockModal, setOnlineMockModal] = useState<any | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchActiveCart();
  }, []);

  const fetchActiveCart = async () => {
    setIsLoading(true);
    const token = localStorage.getItem('tiffin_token');

    try {
      const res = await fetch(`${apiUrl}/cart`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setCart(data.cart);
        setQuote(data.quote);
      }
    } catch (err) {
      console.error('Failed to load cart for checkout:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!cart || !quote) return;
    setIsPlacingOrder(true);
    setPriceChangedError(null);

    const token = localStorage.getItem('tiffin_token');
    const idempotencyKey = generateUuidV7();

    try {
      const res = await fetch(`${apiUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          restaurantId: quote.restaurantId,
          addressId: quote.addressId,
          paymentMode,
          customerNotes: customerNotes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 409 && data.code === 'PRICE_CHANGED') {
        // Price shifted! Show user the refreshed quote
        setPriceChangedError(data);
        if (data.refreshedQuote) {
          setQuote(data.refreshedQuote);
        }
        setIsPlacingOrder(false);
        return;
      }

      if (!res.ok) {
        alert(data.error || 'Failed to place order. Please try again.');
        setIsPlacingOrder(false);
        return;
      }

      const createdOrder = data.order;

      // Handle ONLINE vs COD flow
      if (paymentMode === 'ONLINE' && data.razorpayOrder) {
        setOnlineMockModal({
          order: createdOrder,
          razorpayOrder: data.razorpayOrder,
        });
        setIsPlacingOrder(false);
      } else {
        // COD Order placed directly
        router.push(`/customer/orders/${createdOrder.id}`);
      }
    } catch {
      alert('Network error while placing order.');
      setIsPlacingOrder(false);
    }
  };

  const handleSimulatePaymentSuccess = async () => {
    if (!onlineMockModal) return;
    const { order, razorpayOrder } = onlineMockModal;

    // Send mock payment webhook to simulate Razorpay payment.captured event
    try {
      const mockWebhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        id: `evt_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`,
        payload: {
          payment: {
            entity: {
              id: `pay_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`,
              order_id: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: 'INR',
              status: 'captured',
              notes: { orderId: order.id },
            },
          },
        },
      };

      // In development / demo environment, sign mock webhook with test secret
      const secret = 'rzp_webhook_secret_key';
      // Use crypto or direct POST
      await fetch(`${apiUrl}/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'mock_valid_signature_dev',
        },
        body: JSON.stringify(mockWebhookPayload),
      }).catch(() => {});

      router.push(`/customer/orders/${order.id}`);
    } catch {
      router.push(`/customer/orders/${order.id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-slate-500 text-sm">
        Loading checkout details...
      </div>
    );
  }

  if (!cart || !quote || !quote.items || quote.items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900">Your Cart is Empty</h2>
        <p className="text-xs text-slate-500">
          Looks like you haven&apos;t added any delicious dishes to your tiffin cart yet.
        </p>
        <Link
          href="/customer"
          className="inline-block bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-2.5 rounded-2xl text-xs transition shadow-md"
        >
          Browse Restaurants
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/customer/restaurant/${quote.restaurantId}`}
          className="p-2 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-slate-900">Order Checkout</h1>
          <span className="text-xs text-slate-500 font-medium">
            Review delivery address and select payment method
          </span>
        </div>
      </div>

      {/* 409 Price Changed Warning Banner */}
      {priceChangedError && (
        <div className="bg-amber-50 border border-amber-300 rounded-3xl p-4 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-extrabold text-amber-900 text-xs block">
              Pricing Shift Detected
            </span>
            <p className="text-xs text-amber-800 leading-relaxed">
              Dish pricing, taxes, or delivery fees were updated since you viewed your cart. Your quote has been refreshed to <strong>{formatPaiseToInr(quote.grandTotalPaise)}</strong>. Please review and place your order.
            </p>
          </div>
        </div>
      )}

      {/* Delivery Address Card */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-orange-600" />
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Delivery Address
            </h2>
          </div>
          <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
            SERVICEABLE ({(quote.distanceMeters / 1000).toFixed(1)} km)
          </span>
        </div>

        <div className="text-xs space-y-1">
          <span className="font-extrabold text-slate-900 block">Home • Asha Sharma</span>
          <p className="text-slate-600 leading-relaxed">
            #104, Sunrise Residency, 12th Main, HAL 2nd Stage, Indiranagar, Bengaluru, 560038
          </p>
        </div>
      </div>

      {/* Customer Instructions */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-2">
        <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
          Cooking or Delivery Notes
        </label>
        <input
          type="text"
          value={customerNotes}
          onChange={(e) => setCustomerNotes(e.target.value)}
          placeholder="e.g. Please make it extra spicy, leave bag at the door"
          className="w-full text-xs p-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500 transition"
        />
      </div>

      {/* Payment Method Selector */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-3">
        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
          Select Payment Mode
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            onClick={() => setPaymentMode('ONLINE')}
            className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
              paymentMode === 'ONLINE'
                ? 'bg-orange-50/80 border-orange-500 text-orange-950 font-bold shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  paymentMode === 'ONLINE' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs block font-bold">Online Payment</span>
                <span className="text-[10px] text-slate-500">UPI, Cards, NetBanking</span>
              </div>
            </div>
            {paymentMode === 'ONLINE' && <CheckCircle2 className="w-5 h-5 text-orange-600" />}
          </div>

          <div
            onClick={() => setPaymentMode('COD')}
            className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
              paymentMode === 'COD'
                ? 'bg-orange-50/80 border-orange-500 text-orange-950 font-bold shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  paymentMode === 'COD' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs block font-bold">Cash on Delivery</span>
                <span className="text-[10px] text-slate-500">Pay cash upon delivery</span>
              </div>
            </div>
            {paymentMode === 'COD' && <CheckCircle2 className="w-5 h-5 text-orange-600" />}
          </div>
        </div>
      </div>

      {/* Order Items & Priced Bill Breakdown */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
          Order Summary ({quote.items.length} dishes)
        </h2>

        <div className="space-y-2.5 divide-y divide-slate-100">
          {quote.items.map((item: any) => (
            <div key={item.menuItemId} className="pt-2 first:pt-0 flex items-start justify-between text-xs">
              <div>
                <span className="font-bold text-slate-900">
                  {item.quantity}x {item.name}
                </span>
                {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                  <div className="text-[11px] text-slate-500 pl-4">
                    {item.selectedModifiers.map((m: any) => m.name).join(', ')}
                  </div>
                )}
              </div>
              <span className="text-slate-700 font-bold">
                {formatPaiseToInr(item.lineTotalPaise)}
              </span>
            </div>
          ))}
        </div>

        {/* Breakdown */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Item Subtotal</span>
            <span>{formatPaiseToInr(quote.subtotalPaise)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Food GST (5%)</span>
            <span>{formatPaiseToInr(quote.foodGstPaise)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Delivery Fee ({(quote.distanceMeters / 1000).toFixed(1)} km)</span>
            <span>{formatPaiseToInr(quote.deliveryFeePaise)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Platform Fee</span>
            <span>{formatPaiseToInr(quote.platformFeePaise)}</span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-sm text-slate-900">
            <span>Total Payable</span>
            <span className="text-orange-600">{formatPaiseToInr(quote.grandTotalPaise)}</span>
          </div>
        </div>
      </div>

      {/* Place Order CTA Button */}
      <button
        disabled={isPlacingOrder}
        onClick={handlePlaceOrder}
        className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider text-white shadow-xl transition flex items-center justify-center gap-2 ${
          isPlacingOrder
            ? 'bg-slate-400 cursor-not-allowed'
            : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99]'
        }`}
      >
        <ShieldCheck className="w-4 h-4" />
        <span>
          {isPlacingOrder
            ? 'Processing Order...'
            : `Pay & Place Order • ${formatPaiseToInr(quote.grandTotalPaise)}`}
        </span>
      </button>

      {/* Online Mock Razorpay Gateway Simulator Modal */}
      {onlineMockModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Razorpay Payment Gateway</h3>
              <p className="text-xs text-slate-500 mt-1">
                Amount: <strong>{formatPaiseToInr(onlineMockModal.razorpayOrder.amount)}</strong>
              </p>
              <span className="text-[11px] text-slate-400 block">
                Order ID: {onlineMockModal.razorpayOrder.id}
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleSimulatePaymentSuccess}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-2xl text-xs transition shadow-md flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Simulate Successful UPI Payment</span>
              </button>

              <button
                onClick={() => setOnlineMockModal(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-2xl text-xs transition"
              >
                Cancel Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
