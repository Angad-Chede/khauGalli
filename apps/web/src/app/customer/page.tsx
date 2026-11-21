'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Search,
  Clock,
  Star,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Compass,
} from 'lucide-react';
import { formatPaiseToInr } from '@tiffin/shared';

interface AddressOption {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

const ASHA_ADDRESSES: AddressOption[] = [
  {
    id: '018f0000-0000-7000-8000-000000000021',
    label: 'Home (Indiranagar)',
    address: 'Flat 402, 12th Main, Indiranagar, Bengaluru',
    lat: 12.9716,
    lng: 77.6406,
  },
  {
    id: '018f0000-0000-7000-8000-000000000022',
    label: 'Work (Residency Road)',
    address: 'WeWork Galaxy, 43 Residency Road, Bengaluru',
    lat: 12.9698,
    lng: 77.6083,
  },
];

export default function CustomerDashboard() {
  const [selectedAddress, setSelectedAddress] = useState<AddressOption>(ASHA_ADDRESSES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [matchedDishes, setMatchedDishes] = useState<any[]>([]);
  const [isServiceable, setIsServiceable] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [radiusMeters, setRadiusMeters] = useState(5000);

  const abortControllerRef = useRef<AbortController | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchNearbyRestaurants();
  }, [selectedAddress, radiusMeters]);

  const fetchNearbyRestaurants = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `${apiUrl}/restaurants?lat=${selectedAddress.lat}&lng=${selectedAddress.lng}&radius=${radiusMeters}`
      );
      if (res.ok) {
        const data = await res.json();
        setIsServiceable(data.serviceable);
        setRestaurants(data.restaurants || []);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (text.trim().length < 2) {
      setMatchedDishes([]);
      fetchNearbyRestaurants();
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetch(
      `${apiUrl}/restaurants/search?q=${encodeURIComponent(text.trim())}&lat=${selectedAddress.lat}&lng=${selectedAddress.lng}&radius=${radiusMeters}`,
      { signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setRestaurants(data.matchedRestaurants || []);
          setMatchedDishes(data.matchedDishes || []);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error('Search error:', err);
      });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header & Location Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-xs border border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center text-xs font-semibold text-orange-600 tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" />
            Persona: Asha Sharma (Customer)
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Food Discovery & Browse</h1>

          {/* Location Selector Dropdown */}
          <div className="flex items-center gap-2 pt-1 text-xs">
            <MapPin className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="text-slate-500 font-medium">Deliver to:</span>
            <select
              value={selectedAddress.id}
              onChange={(e) => {
                const found = ASHA_ADDRESSES.find((a) => a.id === e.target.value);
                if (found) setSelectedAddress(found);
              }}
              className="bg-slate-100 font-bold text-slate-800 rounded-lg px-2.5 py-1 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer text-xs"
            >
              {ASHA_ADDRESSES.map((addr) => (
                <option key={addr.id} value={addr.id}>
                  {addr.label} — {addr.address}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Radius Filter Pills */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Radius:</span>
          {[3000, 5000, 8000].map((r) => (
            <button
              key={r}
              onClick={() => setRadiusMeters(r)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                radiusMeters === r
                  ? 'bg-orange-500 text-white border-orange-400 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {r / 1000} km
            </button>
          ))}
        </div>
      </div>

      {/* Serviceability Warning if outside service zones */}
      {!isServiceable && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 flex items-center gap-3 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <strong>Outside Service Zone:</strong> Selected address does not fall within active delivery service polygons in Bengaluru Central.
          </div>
        </div>
      )}

      {/* Multi-tier Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search for restaurants, chaats, dosas, biryani (FTS + Trigram typo-tolerant)..."
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-medium"
        />
        {searchQuery && (
          <button
            onClick={() => handleSearchChange('')}
            className="absolute right-4 top-3.5 text-xs text-slate-400 hover:text-slate-600 font-semibold"
          >
            Clear
          </button>
        )}
      </div>

      {/* Matched Dishes Section (if search matches dishes) */}
      {matchedDishes.length > 0 && (
        <div className="space-y-3 bg-orange-50/50 p-6 rounded-3xl border border-orange-100">
          <h2 className="text-sm font-bold text-orange-950 flex items-center gap-2">
            <span>Dishes matching &quot;{searchQuery}&quot;</span>
            <span className="text-[11px] font-normal text-orange-600">
              ({matchedDishes.length} items found)
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {matchedDishes.map((dish) => (
              <Link
                key={dish.id}
                href={`/customer/restaurant/${dish.restaurantId}`}
                className="bg-white p-3.5 rounded-xl border border-orange-200 hover:border-orange-400 shadow-xs flex justify-between items-center transition"
              >
                <div>
                  <div className="font-bold text-slate-900 text-xs">{dish.name}</div>
                  <div className="text-[11px] text-slate-500">{dish.restaurantName}</div>
                  <div className="text-xs font-extrabold text-orange-600 mt-0.5">
                    {formatPaiseToInr(dish.pricePaise)}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-orange-500" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Restaurant Discovery Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>Restaurants near you</span>
            <span className="text-xs text-slate-400 font-normal">
              ({restaurants.length} available)
            </span>
          </h2>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-slate-400" />
            <span>PostGIS ST_DWithin Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {restaurants.map((rest) => (
            <Link
              key={rest.id}
              href={`/customer/restaurant/${rest.id}`}
              className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden hover:shadow-md hover:border-orange-300 transition-all group flex flex-col justify-between"
            >
              <div>
                {/* Hero Card Banner */}
                <div className="h-36 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 relative p-4 flex flex-col justify-end text-white">
                  <span
                    className={`absolute top-3 right-3 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      rest.isOpenNow
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800/80 text-slate-200'
                    }`}
                  >
                    {rest.isOpenNow ? 'OPEN NOW' : 'CLOSED'}
                  </span>
                  <h3 className="text-lg font-bold leading-tight group-hover:text-orange-100 transition">
                    {rest.name}
                  </h3>
                  <p className="text-xs text-orange-100">
                    {rest.cuisineTypes?.join(' • ')}
                  </p>
                </div>

                {/* Card Info */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-1 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{rest.etaMinutesRange || '15-20 mins'}</span>
                    </div>
                    <div className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                      <span>{rest.ratingAverage || '4.5'}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {rest.description || 'Fresh authentic flavors delivered hot to your doorstep.'}
                  </p>
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">
                  {(rest.distanceMeters / 1000).toFixed(1)} km away
                </span>
                <span className="font-bold text-orange-600 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                  Explore Menu <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
