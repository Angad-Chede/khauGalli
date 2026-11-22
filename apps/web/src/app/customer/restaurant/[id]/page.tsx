'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Star,
  Clock,
  MapPin,
  ShoppingBag,
  Plus,
  Minus,
  AlertTriangle,
  X,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { GreenVegIcon, RedNonVegIcon } from '@/components/VegIcons';
import { formatPaiseToInr } from '@tiffin/shared';

interface ModifierOption {
  id: string;
  name: string;
  pricePaise: number;
  isVeg: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  isVeg: boolean;
  isAvailable: boolean;
  imageUrl: string | null;
  modifierGroups: ModifierGroup[];
}

interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
}

interface RestaurantProfile {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cuisineTypes: string[];
  ratingAverage: number;
  ratingCount: number;
  heroImageUrl: string | null;
  isOpenNow: boolean;
  acceptingOrders: boolean;
  prepTimeDefaultMinutes: number;
  deliveryRadiusMeters: number;
  fssaiLicNo: string | null;
}

export default function RestaurantMenuPage() {
  const params = useParams();
  const router = useRouter();
  const restaurantId = params.id as string;

  const [restaurant, setRestaurant] = useState<RestaurantProfile | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cart state
  const [cartQuote, setCartQuote] = useState<any | null>(null);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);

  // Active modifier modal
  const [selectedItemForModifiers, setSelectedItemForModifiers] = useState<MenuItem | null>(null);
  const [selectedModifierOptionIds, setSelectedModifierOptionIds] = useState<string[]>([]);
  const [modifierError, setModifierError] = useState<string | null>(null);

  // Conflict modal state
  const [conflictData, setConflictData] = useState<{
    currentRestaurant: { id: string; name: string };
    newRestaurant: { id: string; name: string };
    pendingItem: any;
  } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  // Asha's default Home address ID in Bengaluru Indiranagar
  const defaultAddressId = '018f0000-0000-7000-8000-000000000021';

  useEffect(() => {
    fetchMenu();
    fetchExistingCart();
  }, [restaurantId]);

  const fetchMenu = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/restaurants/${restaurantId}/menu`);
      if (res.ok) {
        const data = await res.json();
        setRestaurant(data.restaurant);
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to load menu:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExistingCart = async () => {
    const token = localStorage.getItem('tiffin_token');
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/cart`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.quote) {
          setCartQuote(data.quote);
          setCartItems(data.cart?.items || []);
        }
      }
    } catch {
      // Offline fallback
    }
  };

  const handleAddItemClick = (item: MenuItem) => {
    if (!item.isAvailable) return;

    if (item.modifierGroups && item.modifierGroups.length > 0) {
      setSelectedItemForModifiers(item);
      setSelectedModifierOptionIds([]);
      setModifierError(null);
    } else {
      executeAddToCart(item, []);
    }
  };

  const executeAddToCart = async (
    item: MenuItem,
    modifierIds: string[],
    replaceExisting = false
  ) => {
    const token = localStorage.getItem('tiffin_token');
    if (!token) {
      alert('Please select Asha (Customer) from the top demo switcher to place orders!');
      return;
    }

    const newItems = replaceExisting
      ? [{ menuItemId: item.id, quantity: 1, selectedModifierOptionIds: modifierIds }]
      : [
          ...cartItems,
          { menuItemId: item.id, quantity: 1, selectedModifierOptionIds: modifierIds },
        ];

    try {
      const res = await fetch(`${apiUrl}/cart`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurantId,
          addressId: defaultAddressId,
          items: newItems,
          replaceExisting,
        }),
      });

      if (res.status === 409) {
        const errData = await res.json();
        setConflictData({
          currentRestaurant: errData.currentRestaurant,
          newRestaurant: errData.newRestaurant,
          pendingItem: { item, modifierIds },
        });
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setCartQuote(data.quote);
        setCartItems(newItems);
        setSelectedItemForModifiers(null);
        setConflictData(null);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to update cart');
      }
    } catch (err: any) {
      alert(err.message || 'Cart update failed');
    }
  };

  const handleModifierOptionToggle = (group: ModifierGroup, optionId: string) => {
    const isSingleChoice = group.maxSelections === 1;

    if (isSingleChoice) {
      // Replace existing selection in this group
      const otherGroupOptionIds = selectedModifierOptionIds.filter(
        (id) => !group.options.some((o) => o.id === id)
      );
      setSelectedModifierOptionIds([...otherGroupOptionIds, optionId]);
    } else {
      // Multi-choice toggle
      const isSelected = selectedModifierOptionIds.includes(optionId);
      const currentInGroup = selectedModifierOptionIds.filter((id) =>
        group.options.some((o) => o.id === id)
      );

      if (isSelected) {
        setSelectedModifierOptionIds(selectedModifierOptionIds.filter((id) => id !== optionId));
      } else {
        if (currentInGroup.length >= group.maxSelections) {
          setModifierError(`Maximum ${group.maxSelections} selection(s) allowed for "${group.name}".`);
          return;
        }
        setModifierError(null);
        setSelectedModifierOptionIds([...selectedModifierOptionIds, optionId]);
      }
    }
  };

  const confirmModifiersAndAdd = () => {
    if (!selectedItemForModifiers) return;

    // Validate min selections
    for (const group of selectedItemForModifiers.modifierGroups) {
      const groupSelectedCount = selectedModifierOptionIds.filter((id) =>
        group.options.some((o) => o.id === id)
      ).length;

      if (groupSelectedCount < group.minSelections) {
        setModifierError(`Please make at least ${group.minSelections} selection for "${group.name}".`);
        return;
      }
    }

    executeAddToCart(selectedItemForModifiers, selectedModifierOptionIds);
  };

  const calculateModalPrice = () => {
    if (!selectedItemForModifiers) return 0;
    let total = selectedItemForModifiers.pricePaise;

    selectedItemForModifiers.modifierGroups.forEach((g) => {
      g.options.forEach((opt) => {
        if (selectedModifierOptionIds.includes(opt.id)) {
          total += opt.pricePaise;
        }
      });
    });

    return total;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Top Navigation */}
      <div className="bg-white border-b border-slate-200 sticky top-12 z-30 px-4 py-3 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/customer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Discovery</span>
          </Link>
          <span className="text-xs font-mono text-slate-400">
            FSSAI: {restaurant?.fssaiLicNo || '11223344556677'}
          </span>
        </div>
      </div>

      {/* Restaurant Header */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    restaurant?.isOpenNow
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {restaurant?.isOpenNow ? 'OPEN NOW' : 'TEMPORARILY CLOSED'}
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-medium text-slate-500">
                  {restaurant?.cuisineTypes.join(' • ')}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {restaurant?.name || 'Khau Galli Chaat & Street Eats'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xl">
                {restaurant?.description}
              </p>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-1 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-2xl">
              <div className="flex items-center gap-1 bg-emerald-600 text-white px-2.5 py-1 rounded-xl text-xs font-bold shadow-xs">
                <Star className="w-3.5 h-3.5 fill-white text-white" />
                <span>{restaurant?.ratingAverage || '4.6'}</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {restaurant?.ratingCount || 142} ratings
              </span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-6 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 font-medium">
              <Clock className="w-4 h-4 text-orange-500" />
              <span>{restaurant?.prepTimeDefaultMinutes || 15} mins delivery time</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <MapPin className="w-4 h-4 text-orange-500" />
              <span>Delivers within {(restaurant?.deliveryRadiusMeters || 5000) / 1000} km</span>
            </div>
          </div>
        </div>

        {/* Categorized Menu */}
        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category.id} className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
                <span>{category.name}</span>
                <span className="text-xs font-normal text-slate-400">
                  {category.items.length} dishes
                </span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {category.items.map((dish) => (
                  <div
                    key={dish.id}
                    className={`bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between transition-all ${
                      !dish.isAvailable ? 'opacity-65 bg-slate-50/60' : 'hover:shadow-sm'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {dish.isVeg ? <GreenVegIcon /> : <RedNonVegIcon />}
                          <h3 className="font-bold text-slate-900 text-sm">{dish.name}</h3>
                        </div>
                        {!dish.isAvailable && (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Out of stock
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-extrabold text-slate-900">
                        {formatPaiseToInr(dish.pricePaise)}
                      </div>

                      {dish.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {dish.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-4 mt-2 flex items-center justify-between border-t border-slate-100">
                      {dish.modifierGroups && dish.modifierGroups.length > 0 ? (
                        <span className="text-[11px] text-orange-600 font-medium">
                          Customizable
                        </span>
                      ) : (
                        <span />
                      )}

                      <button
                        onClick={() => handleAddItemClick(dish)}
                        disabled={!dish.isAvailable}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                          dish.isAvailable
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-600 hover:text-white'
                            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        }`}
                      >
                        {dish.isAvailable ? '+ ADD' : 'UNAVAILABLE'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Bottom Cart Bar */}
      {cartQuote && cartQuote.items.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-4 shadow-xl z-40 border-t border-slate-800">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  {cartQuote.items.length} {cartQuote.items.length === 1 ? 'item' : 'items'}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-base font-extrabold text-white">
                  {formatPaiseToInr(cartQuote.grandTotalPaise)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Includes GST & Tiered Delivery Fee (15m Quote Guarantee)
              </p>
            </div>

            <button
              onClick={() => setIsCartDrawerOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition flex items-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>View Cart & Bill</span>
            </button>
          </div>
        </div>
      )}

      {/* Cart & Bill Drawer Modal */}
      {isCartDrawerOpen && cartQuote && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full flex flex-col justify-between shadow-2xl p-6 overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-orange-500" />
                  <span>Your Cart & Quote</span>
                </h2>
                <button
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Unavailable Item Alert */}
              {cartQuote.hasUnavailableItems && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Notice:</strong> One or more dishes in your cart are currently out of stock.
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-3 divide-y divide-slate-100">
                {cartQuote.items.map((item: any) => (
                  <div key={item.menuItemId} className="pt-3 first:pt-0 flex justify-between items-start text-xs">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{item.name}</span>
                        {!item.isAvailable && (
                          <span className="text-[10px] text-rose-600 bg-rose-50 px-1.5 rounded-sm">
                            Sold Out
                          </span>
                        )}
                      </div>
                      {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {item.selectedModifiers.map((m: any) => m.name).join(', ')}
                        </div>
                      )}
                      <div className="text-slate-500 mt-1">
                        Qty: {item.quantity} × {formatPaiseToInr(item.unitPricePaise)}
                      </div>
                    </div>
                    <div className="font-extrabold text-slate-900">
                      {formatPaiseToInr(item.lineTotalPaise)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bill Breakdown */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 text-xs">
                <div className="font-bold text-slate-900 mb-1">Priced Bill Breakdown</div>
                <div className="flex justify-between text-slate-600">
                  <span>Item Subtotal</span>
                  <span>{formatPaiseToInr(cartQuote.subtotalPaise)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Food GST (5%)</span>
                  <span>{formatPaiseToInr(cartQuote.foodGstPaise)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Partner Fee ({(cartQuote.distanceMeters / 1000).toFixed(1)} km)</span>
                  <span>{formatPaiseToInr(cartQuote.deliveryFeePaise)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Platform Fee</span>
                  <span>{formatPaiseToInr(cartQuote.platformFeePaise)}</span>
                </div>
                {cartQuote.packagingFeePaise > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Restaurant Packaging</span>
                    <span>{formatPaiseToInr(cartQuote.packagingFeePaise)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-sm text-slate-900">
                  <span>To Pay (Grand Total)</span>
                  <span className="text-orange-600">{formatPaiseToInr(cartQuote.grandTotalPaise)}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <button
                disabled={cartQuote.hasUnavailableItems}
                onClick={() => {
                  router.push('/customer/checkout');
                }}
                className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-md transition ${
                  cartQuote.hasUnavailableItems
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                Proceed to Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier Customizer Modal */}
      {selectedItemForModifiers && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col justify-between shadow-2xl p-6 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Customize {selectedItemForModifiers.name}
                  </h3>
                  <span className="text-xs text-slate-500 font-semibold">
                    Base: {formatPaiseToInr(selectedItemForModifiers.pricePaise)}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedItemForModifiers(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {modifierError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2.5 rounded-xl font-medium">
                  {modifierError}
                </div>
              )}

              {/* Modifier Groups */}
              <div className="space-y-5">
                {selectedItemForModifiers.modifierGroups.map((group) => (
                  <div key={group.id} className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">{group.name}</span>
                      <span className="text-[11px] text-slate-500">
                        {group.minSelections > 0
                          ? `Pick ${group.minSelections} (Mandatory)`
                          : `Pick up to ${group.maxSelections}`}
                      </span>
                    </div>

                    <div className="space-y-2 pt-1">
                      {group.options.map((option) => {
                        const isSelected = selectedModifierOptionIds.includes(option.id);
                        return (
                          <div
                            key={option.id}
                            onClick={() => handleModifierOptionToggle(group, option.id)}
                            className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition ${
                              isSelected
                                ? 'bg-orange-50 border-orange-400 text-orange-950 font-semibold'
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-4 h-4 rounded-${
                                  group.maxSelections === 1 ? 'full' : 'md'
                                } border flex items-center justify-center ${
                                  isSelected
                                    ? 'bg-orange-500 border-orange-500 text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <span>{option.name}</span>
                            </div>

                            <span className="text-slate-600 font-bold">
                              {option.pricePaise > 0 ? `+ ${formatPaiseToInr(option.pricePaise)}` : 'FREE'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between mt-4">
              <div>
                <span className="text-[11px] text-slate-400 block font-semibold">Total Price</span>
                <span className="text-base font-extrabold text-slate-900">
                  {formatPaiseToInr(calculateModalPrice())}
                </span>
              </div>

              <button
                onClick={confirmModifiersAndAdd}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 409 Multi-Restaurant Conflict Dialog */}
      {conflictData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">Replace Items in Cart?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your cart already has items from <strong>{conflictData.currentRestaurant.name}</strong>. A cart can only contain dishes from one restaurant at a time.
            </p>
            <div className="space-y-2 pt-2">
              <button
                onClick={() =>
                  executeAddToCart(
                    conflictData.pendingItem.item,
                    conflictData.pendingItem.modifierIds,
                    true // replaceExisting
                  )
                }
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-sm"
              >
                Discard & Add New Dish
              </button>
              <button
                onClick={() => setConflictData(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition"
              >
                Keep Current Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
