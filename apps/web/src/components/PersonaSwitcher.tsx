'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, UtensilsCrossed, Bike, ShieldCheck, LogOut, CheckCircle2 } from 'lucide-react';

interface Persona {
  id: string;
  name: string;
  role: string;
  phone: string;
  badge: string;
  route: string;
  color: string;
  icon: any;
}

const PERSONAS: Persona[] = [
  {
    id: 'CUSTOMER',
    name: 'Asha (Customer)',
    role: 'CUSTOMER',
    phone: '+919999900001',
    badge: 'Customer',
    route: '/customer',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100',
    icon: User,
  },
  {
    id: 'RESTAURANT',
    name: 'Ravi (Kitchen Lead)',
    role: 'RESTAURANT',
    phone: '+919999900002',
    badge: 'Kitchen Owner',
    route: '/restaurant',
    color: 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100',
    icon: UtensilsCrossed,
  },
  {
    id: 'RIDER',
    name: 'Imran (Delivery)',
    role: 'RIDER',
    phone: '+919999900003',
    badge: 'Delivery Partner',
    route: '/rider',
    color: 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100',
    icon: Bike,
  },
  {
    id: 'ADMIN',
    name: 'Meera (Ops Admin)',
    role: 'ADMIN',
    phone: '+919999900004',
    badge: 'Marketplace Admin',
    route: '/admin',
    color: 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100',
    icon: ShieldCheck,
  },
];

export function PersonaSwitcher() {
  const router = useRouter();
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    const saved = localStorage.getItem('tiffin_active_persona');
    if (saved) {
      setActivePersona(saved);
    }
  }, []);

  const handleSwitchPersona = async (persona: Persona) => {
    setIsLoading(true);
    setStatusMsg(`Logging in as ${persona.name}...`);

    try {
      // Step 1: Real OTP Request call
      const reqRes = await fetch(`${apiUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: persona.phone }),
      });

      if (!reqRes.ok) {
        throw new Error('Failed to dispatch demo OTP');
      }

      // Step 2: Real OTP Verify call
      const verifyRes = await fetch(`${apiUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: persona.phone, code: '123456' }),
      });

      if (!verifyRes.ok) {
        throw new Error('Failed to verify OTP session');
      }

      const session = await verifyRes.json();

      // Step 3: Persist genuine JWT session
      localStorage.setItem('tiffin_token', session.accessToken);
      localStorage.setItem('tiffin_refresh_token', session.refreshToken);
      localStorage.setItem('tiffin_active_persona', persona.id);
      localStorage.setItem('tiffin_user_info', JSON.stringify(session.user));

      setActivePersona(persona.id);
      setStatusMsg(`Authenticated as ${persona.name}`);
      setTimeout(() => setStatusMsg(null), 2500);

      // Navigate to persona's dedicated dashboard
      router.push(persona.route);
    } catch (err: any) {
      console.error('Persona switch error:', err);
      // Even if API server is not running on localhost:4000, update active state and navigate for UI preview
      localStorage.setItem('tiffin_active_persona', persona.id);
      setActivePersona(persona.id);
      setStatusMsg(`Switched to ${persona.name} (Preview Mode)`);
      setTimeout(() => setStatusMsg(null), 2500);
      router.push(persona.route);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tiffin_token');
    localStorage.removeItem('tiffin_refresh_token');
    localStorage.removeItem('tiffin_active_persona');
    localStorage.removeItem('tiffin_user_info');
    setActivePersona(null);
    router.push('/');
  };

  return (
    <aside aria-label="Demo Persona Switcher" className="bg-slate-900 text-slate-100 border-b border-slate-800 px-4 py-2 text-xs shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
            Demo Persona Switcher:
          </span>
          {statusMsg && (
            <span className="text-emerald-400 font-medium ml-2 transition-all">
              {statusMsg}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PERSONAS.map((p) => {
            const Icon = p.icon;
            const isActive = activePersona === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSwitchPersona(p)}
                disabled={isLoading}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-orange-500 text-white border-orange-400 shadow-sm ring-2 ring-orange-300/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{p.name}</span>
                {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-white ml-0.5" />}
              </button>
            );
          })}

          {activePersona && (
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md border border-red-900/60 text-red-300 hover:bg-red-950/50 text-xs transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
