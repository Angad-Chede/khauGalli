import Link from 'next/link';
import { User, UtensilsCrossed, Bike, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function HomePage() {
  const personas = [
    {
      title: 'Customer Experience',
      name: 'Asha Sharma',
      desc: 'Browse restaurants within serviceable radius using PostGIS ST_DWithin, cart, and live tracking.',
      href: '/customer',
      icon: User,
      badge: 'Order Food',
      color: 'border-emerald-200 hover:border-emerald-400 bg-emerald-50/40',
      btnColor: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
    {
      title: 'Kitchen Display System',
      name: 'Ravi Patel',
      desc: 'Real-time order board (New, Preparing, Ready) with auto-reject countdown and audible chimes.',
      href: '/restaurant',
      icon: UtensilsCrossed,
      badge: 'Manage Kitchen',
      color: 'border-orange-200 hover:border-orange-400 bg-orange-50/40',
      btnColor: 'bg-orange-600 hover:bg-orange-700 text-white',
    },
    {
      title: 'Delivery Partner Console',
      name: 'Imran Khan',
      desc: 'Location tracking stream, 30s atomic offer window, turn-by-turn navigation, and OTP handover.',
      href: '/rider',
      icon: Bike,
      badge: 'Deliver Orders',
      color: 'border-blue-200 hover:border-blue-400 bg-blue-50/40',
      btnColor: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    {
      title: 'Marketplace Operations',
      name: 'Meera Sundaram',
      desc: 'Live ops board, stuck-order alerts, audit logs, restaurant settlements, and GMV analytics.',
      href: '/admin',
      icon: ShieldCheck,
      badge: 'Admin & Ops',
      color: 'border-purple-200 hover:border-purple-400 bg-purple-50/40',
      btnColor: 'bg-purple-600 hover:bg-purple-700 text-white',
    },
  ];

  return (
    <main className="max-w-6xl mx-auto px-4 py-12 space-y-12">
      {/* Hero Header */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          Production-Shaped Food Ordering & Delivery Architecture
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
          KhauGalli <span className="text-orange-600">(Codename: Tiffin)</span>
        </h1>
        <p className="text-base sm:text-lg text-slate-600">
          A multi-role food ordering platform designed with strict modular boundaries, PostgreSQL + PostGIS core, transactional outbox pattern, and real-time order lifecycle.
        </p>
      </div>

      {/* 4 Role Interfaces Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {personas.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.title}
              className={`p-6 rounded-2xl border transition-all shadow-sm hover:shadow-md flex flex-col justify-between ${p.color}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-800">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/80 text-slate-700 border border-slate-200">
                    {p.badge}
                  </span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{p.title}</h2>
                  <p className="text-xs font-semibold text-slate-500">Persona: {p.name}</p>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{p.desc}</p>
              </div>

              <div className="pt-6">
                <Link
                  href={p.href}
                  className={`inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-semibold shadow-sm transition ${p.btnColor}`}
                >
                  <span>Launch {p.name.split(' ')[0]}&apos;s View</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Architecture Highlights Pill Box */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-500">
          Phase 0 Foundations Active
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>PostGIS Point & GIST spatial indexes</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>Cryptographic OTP + Demo guardrails</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>Rotated refresh tokens & JWT claims</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>Idempotent seed with is_demo safety flags</span>
          </div>
        </div>
      </div>
    </main>
  );
}
