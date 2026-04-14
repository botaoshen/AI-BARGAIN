import { useState, useEffect } from 'react';
import { Search, Sparkles, ShoppingBag, Loader2, ArrowRight, Clock, CheckCircle2, CalendarDays, Mail, Copy, Ticket, CreditCard, ShieldCheck, Zap, AlertCircle, RefreshCw, LogIn, LogOut, User as UserIcon, Heart, ArrowLeft, Settings, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { findDiscountCodes, generateDiscountEmail, getGiftCardDeals, BargainResult, GiftCardDeal } from './services/gemini';
import { DiscountCard } from './components/DiscountCard';
import { supabase } from './lib/supabase';
import { AuthModal } from './components/AuthModal';

export default function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BargainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [showSubModal, setShowSubModal] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subSuccess, setSubSuccess] = useState(false);

  const [emailTemplate, setEmailTemplate] = useState<{subject: string, body: string} | null>(null);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [giftCardDeals, setGiftCardDeals] = useState<GiftCardDeal[]>([]);
  const [dealsLastUpdated, setDealsLastUpdated] = useState<string | null>(null);
  const [syncingDeals, setSyncingDeals] = useState(false);

  // User & Limits State
  const [userId, setUserId] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<'free' | 'pro' | 'admin'>('free');
  const [isOG, setIsOG] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [extraSearches, setExtraSearches] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [managingSub, setManagingSub] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [redeemingVoucher, setRedeemingVoucher] = useState(false);
  const [voucherMessage, setVoucherMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  // Auth State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Hub State
  const [currentView, setCurrentView] = useState<'search' | 'hub' | 'admin'>('search');
  const [savedDeals, setSavedDeals] = useState<any[]>([]);
  const [trackedBrands, setTrackedBrands] = useState<{name: string, hasNewDeals: boolean}[]>([]);
  const [searchHistory, setSearchHistory] = useState<{query: string, timestamp: string}[]>([]);

  useEffect(() => {
    if (userId) {
      const saved = localStorage.getItem(`saved_deals_${userId}`);
      if (saved) {
        try {
          setSavedDeals(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse saved deals", e);
        }
      }
      const tracked = localStorage.getItem(`tracked_brands_${userId}`);
      if (tracked) {
        try {
          setTrackedBrands(JSON.parse(tracked));
        } catch (e) {
          console.error("Failed to parse tracked brands", e);
        }
      }
      const history = localStorage.getItem(`search_history_${userId}`);
      if (history) {
        try {
          setSearchHistory(JSON.parse(history));
        } catch (e) {
          console.error("Failed to parse search history", e);
        }
      }
    }
  }, [userId]);

  useEffect(() => {
    const initUser = async (supabaseUser: any = null) => {
      let id = null;
      let email = null;
      
      if (supabaseUser) {
        id = supabaseUser.id;
        email = supabaseUser.email;
      } else {
        try {
          id = localStorage.getItem('bargain_user_id');
          if (!id) {
            id = Math.random().toString(36).substring(2, 15);
            localStorage.setItem('bargain_user_id', id);
          }
        } catch (e) {
          id = 'guest-' + Math.random().toString(36).substring(2, 5);
        }
      }
      
      setUserId(id);
      setUserEmail(email);

      try {
        const endpoint = supabaseUser ? '/api/user/sync' : '/api/user/init';
        const body = supabaseUser ? { userId: id, email } : { userId: id };
        
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error("API not available");
        const data = await res.json();
        if (data.user) {
          setUserTier(email === 'botaoshen@gmail.com' ? 'admin' : data.user.tier);
          setIsOG(!!data.user.isOG);
          setDailyCount(data.dailyCount);
          setExtraSearches(data.extraSearches || 0);
        }
      } catch (err) {
        console.warn("Backend API not available, falling back to local storage");
        let localTier = (localStorage.getItem('bargain_tier') as 'free' | 'pro' | 'admin') || 'free';
        if (email === 'botaoshen@gmail.com') {
          localTier = 'admin';
        }
        const localCount = parseInt(localStorage.getItem('bargain_count') || '0');
        const localExtra = parseInt(localStorage.getItem('bargain_extra') || '0');
        const localDate = localStorage.getItem('bargain_date');
        const today = new Date().toDateString();
        
        setUserTier(localTier);
        setExtraSearches(localExtra);
        if (localDate !== today) {
          setDailyCount(0);
          localStorage.setItem('bargain_count', '0');
          localStorage.setItem('bargain_date', today);
        } else {
          setDailyCount(localCount);
        }
      }
    };

    const checkAuthAndInit = async () => {
      // Check for successful upgrade redirect
      const urlParams = new URLSearchParams(window.location.search);
      const upgradeStatus = urlParams.get('upgrade');
      const sessionId = urlParams.get('session_id');

      if (upgradeStatus === 'success' && sessionId) {
        try {
          await fetch('/api/verify-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          });
          localStorage.setItem('bargain_tier', 'pro');
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
          console.error("Failed to verify checkout", e);
        }
      }

      // Check active session
      const { data: { session } } = await supabase.auth.getSession();
      await initUser(session?.user);
    };

    checkAuthAndInit();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      initUser(session?.user);
    });

    const fetchGiftCards = async () => {
      const response = await getGiftCardDeals();
      setGiftCardDeals(response.deals);
      setDealsLastUpdated(response.lastUpdated);
    };
    
    fetchGiftCards();

    return () => subscription.unsubscribe();
  }, []);

  const handleSyncDeals = async () => {
    setSyncingDeals(true);
    try {
      const res = await fetch('/api/gift-cards/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.deals) {
          setGiftCardDeals(data.deals);
          setDealsLastUpdated(data.lastUpdated);
        }
      } else {
        const err = await res.json();
        alert(`Failed to sync: ${err.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Failed to sync: ${e.message}`);
    } finally {
      setSyncingDeals(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const searchQuery = overrideQuery || query;
    if (!searchQuery.trim() || !userId) return;

    // Check limit client-side first for better UX
    if (userTier !== 'admin' && userTier === 'free' && dailyCount >= 1 && extraSearches <= 0) {
      setShowUpgradeModal(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Try to log search and check limit server-side
      try {
        const logRes = await fetch('/api/user/log-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });

        if (logRes.status === 403) {
          setShowUpgradeModal(true);
          setLoading(false);
          return;
        }

        if (!logRes.ok) throw new Error("API not available");
        const logData = await logRes.json();
        setDailyCount(logData.newCount);
        if (logData.extraSearches !== undefined) {
          setExtraSearches(logData.extraSearches);
        }
      } catch (e) {
        // Fallback to local storage for Vercel
        const currentLocalCount = parseInt(localStorage.getItem('bargain_count') || '0');
        const currentExtra = parseInt(localStorage.getItem('bargain_extra') || '0');
        
        if (currentLocalCount >= 1 && currentExtra > 0) {
          const newExtra = currentExtra - 1;
          setExtraSearches(newExtra);
          localStorage.setItem('bargain_extra', newExtra.toString());
        } else {
          const newCount = currentLocalCount + 1;
          setDailyCount(newCount);
          localStorage.setItem('bargain_count', newCount.toString());
        }
        localStorage.setItem('bargain_date', new Date().toDateString());
      }

      const data = await findDiscountCodes(searchQuery);
      setResult(data);

      // Add to search history
      setSearchHistory(prev => {
        const newHistory = [{ query: searchQuery, timestamp: new Date().toISOString() }, ...prev.filter(h => h.query !== searchQuery)].slice(0, 20);
        localStorage.setItem(`search_history_${userId}`, JSON.stringify(newHistory));
        return newHistory;
      });
    } catch (err: any) {
      if (err?.message && err.message.toLowerCase().includes('api key')) {
        setError('API Key missing or invalid. Please check VITE_GEMINI_API_KEY in Vercel settings.');
      } else {
        setError('Failed to find deals. Please try again later.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim() || !userId) return;
    
    setRedeemingVoucher(true);
    setVoucherMessage(null);

    try {
      const res = await fetch('/api/voucher/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: voucherCode.trim() })
      });
      const data = await res.json();
      
      if (res.ok) {
        setVoucherMessage({ type: 'success', text: data.message });
        setExtraSearches(data.extraSearches);
        setTimeout(() => {
          setShowUpgradeModal(false);
          setVoucherMessage(null);
          setVoucherCode('');
        }, 2000);
      } else {
        setVoucherMessage({ type: 'error', text: data.error || 'Failed to redeem voucher' });
      }
    } catch (err) {
      // Fallback for Vercel
      if (voucherCode.trim().toLowerCase() === 'test50') {
        const newExtra = extraSearches + 50;
        setExtraSearches(newExtra);
        localStorage.setItem('bargain_extra', newExtra.toString());
        setVoucherMessage({ type: 'success', text: 'Successfully redeemed 50 searches!' });
        setTimeout(() => {
          setShowUpgradeModal(false);
          setVoucherMessage(null);
          setVoucherCode('');
        }, 2000);
      } else {
        setVoucherMessage({ type: 'error', text: 'Invalid voucher code or API not available' });
      }
    } finally {
      setRedeemingVoucher(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!userId) return;
    setManagingSub(true);
    try {
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to open subscription portal");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to billing portal");
    } finally {
      setManagingSub(false);
    }
  };

  const handleUpgrade = async () => {
    if (!userId) {
      setShowAuthModal(true);
      return;
    }
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email: userEmail })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setUpgradeError(data.error || "Failed to start checkout");
      }
    } catch (err: any) {
      console.error(err);
      setUpgradeError(err.message || "Failed to connect to payment provider.");
    } finally {
      setUpgrading(false);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !result) return;

    setSubscribing(true);
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, storeName: result.storeName }),
      });
      if (response.ok) {
        setSubSuccess(true);
        setTimeout(() => {
          setShowSubModal(false);
          setSubSuccess(false);
        }, 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubscribing(false);
    }
  };

  const handleGenerateEmail = async () => {
    if (!result) return;
    if (userTier === 'free') {
      setShowUpgradeModal(true);
      return;
    }
    setGeneratingEmail(true);
    setShowEmailModal(true);
    try {
      const template = await generateDiscountEmail(result.storeName);
      setEmailTemplate(template);
    } catch (err) {
      console.error(err);
      // Fallback if it fails
      setEmailTemplate({
        subject: "Student discount inquiry",
        body: "Hi there,\n\nI'm an international student and a huge fan of your brand. I'm on a tight budget and was wondering if you offer any student discounts or promo codes?\n\nThank you!"
      });
    } finally {
      setGeneratingEmail(false);
    }
  };

  const popularStores = ['The Iconic', 'ASOS', 'Nike', 'Amazon', 'Uber Eats'];

  // Admin State
  const [adminStats, setAdminStats] = useState<any>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [addCreditsEmail, setAddCreditsEmail] = useState('');
  const [addCreditsAmount, setAddCreditsAmount] = useState(100);
  const [addingCredits, setAddingCredits] = useState(false);
  const [togglingOg, setTogglingOg] = useState<string | null>(null);

  useEffect(() => {
    if (currentView === 'admin' && userTier === 'admin') {
      fetchAdminStats();
    }
  }, [currentView, userTier]);

  const fetchAdminStats = async () => {
    setLoadingAdmin(true);
    try {
      const res = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: userEmail })
      });
      const data = await res.json();
      if (res.ok) {
        setAdminStats(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleAddCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCreditsEmail || !addCreditsAmount) return;
    setAddingCredits(true);
    try {
      const res = await fetch('/api/admin/add-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: userEmail, targetEmail: addCreditsEmail, creditsToAdd: Number(addCreditsAmount) })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Successfully added ${addCreditsAmount} credits to ${addCreditsEmail}. New balance: ${data.newCredits}`);
        setAddCreditsEmail('');
        fetchAdminStats(); // Refresh list
      } else {
        alert(data.error || 'Failed to add credits');
      }
    } catch (e) {
      console.error(e);
      alert('Error adding credits');
    } finally {
      setAddingCredits(false);
    }
  };

  const handleToggleOg = async (userId: string, currentStatus: boolean) => {
    if (!userEmail) return;
    setTogglingOg(userId);
    try {
      const res = await fetch('/api/admin/toggle-og', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: userEmail, userId, isOG: !currentStatus })
      });
      if (res.ok) {
        fetchAdminStats();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to toggle OG status');
      }
    } catch (err) {
      console.error(err);
      alert('Error toggling OG status');
    } finally {
      setTogglingOg(null);
    }
  };

  const toggleSaveDeal = (deal: any, storeName: string) => {
    if (!userId || userId.startsWith('guest-')) {
      setShowAuthModal(true);
      return;
    }
    setSavedDeals(prev => {
      const isSaved = prev.some(d => d.storeName === storeName && d.deal.description === deal.description);
      let next;
      if (isSaved) {
        next = prev.filter(d => !(d.storeName === storeName && d.deal.description === deal.description));
      } else {
        next = [...prev, { storeName, deal }];
      }
      localStorage.setItem(`saved_deals_${userId}`, JSON.stringify(next));
      return next;
    });
  };

  const toggleTrackBrand = (storeName: string) => {
    if (!userId || userId.startsWith('guest-')) {
      setShowAuthModal(true);
      return;
    }
    setTrackedBrands(prev => {
      const isTracked = prev.some(b => b.name === storeName);
      let next;
      if (isTracked) {
        next = prev.filter(b => b.name !== storeName);
      } else {
        // Randomly simulate new deals for demonstration purposes
        next = [...prev, { name: storeName, hasNewDeals: Math.random() > 0.5 }];
      }
      localStorage.setItem(`tracked_brands_${userId}`, JSON.stringify(next));
      return next;
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans selection:bg-emerald-200">
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">BargainAgent</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-6 text-sm font-medium text-slate-500">
            <div className={`flex items-center gap-2 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs transition-all ${
              userTier === 'pro' || userTier === 'admin'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' 
                : 'bg-slate-100 text-slate-600'
            }`}>
              {(userTier === 'pro' || userTier === 'admin') && <Zap className="w-3 h-3 fill-current" />}
              <span className="font-bold">
                {userTier === 'admin' ? 'ADMIN' : (userTier === 'pro' ? 'PRO' : 'Free')}
              </span>
              {userTier === 'free' && (
                <span className="text-slate-400 border-l border-slate-200 ml-1 pl-2">
                  {extraSearches > 0 ? (
                    <span className="text-indigo-600 font-bold">{Math.max(0, 1 - dailyCount) + extraSearches} left</span>
                  ) : (
                    <>{Math.max(0, 1 - dailyCount)} left</>
                  )}
                </span>
              )}
              {userTier === 'pro' && (
                <span className="text-indigo-200 border-l border-indigo-500 ml-1 pl-2">
                  <span className="text-white font-bold">{extraSearches} left</span>
                </span>
              )}
            </div>
            
            {isOG && (
              <div className="flex items-center gap-1 px-1.5 sm:px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold tracking-wider uppercase border border-amber-200 shadow-sm">
                <Sparkles className="w-3 h-3" />
                <span className="hidden sm:inline">OG</span>
              </div>
            )}
            
            {userEmail ? (
              <div className="flex items-center gap-1 sm:gap-4">
                {userTier === 'admin' && (
                  <button
                    onClick={() => setCurrentView(currentView === 'admin' ? 'search' : 'admin')}
                    className={`p-2 sm:p-0 text-sm font-medium transition-colors flex items-center gap-1.5 rounded-lg ${currentView === 'admin' ? 'text-indigo-600 bg-indigo-50 sm:bg-transparent' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 sm:hover:bg-transparent'}`}
                    title="Admin"
                  >
                    <Shield className="w-5 h-5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </button>
                )}
                <button
                  onClick={() => setCurrentView(currentView === 'hub' ? 'search' : 'hub')}
                  className={`p-2 sm:p-0 text-sm font-medium transition-colors flex items-center gap-1.5 rounded-lg ${currentView === 'hub' ? 'text-indigo-600 bg-indigo-50 sm:bg-transparent' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 sm:hover:bg-transparent'}`}
                  title="My Hub"
                >
                  <Heart className="w-5 h-5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">My Hub</span>
                </button>
                <div className="hidden sm:block w-px h-4 bg-slate-200"></div>
                <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-slate-600">
                  <UserIcon className="w-4 h-4" />
                  <span className="truncate max-w-[120px]">{userEmail}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 sm:p-0 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 sm:hover:bg-transparent transition-colors flex items-center gap-1 rounded-lg"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Sign In / Sign Up</span>
                <span className="sm:hidden">Sign In</span>
              </button>
            )}

            <button 
              onClick={() => setShowHowItWorks(true)} 
              className="hidden md:inline hover:text-indigo-600 transition-colors font-medium"
            >
              How it works
            </button>
            {userTier === 'free' && (
              <button 
                onClick={() => setShowUpgradeModal(true)}
                className="bg-indigo-600 text-white px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100"
              >
                Upgrade
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        {currentView === 'admin' && userTier === 'admin' ? (
          <div className="w-full">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                <Shield className="w-8 h-8 text-indigo-600" />
                Admin Dashboard
              </h2>
              <button onClick={() => setCurrentView('search')} className="text-indigo-600 font-medium hover:text-indigo-700 flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Back to Search
              </button>
            </div>

            {loadingAdmin || !adminStats ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="space-y-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <p className="text-sm font-medium text-slate-500 mb-1">Total Users</p>
                    <p className="text-3xl font-bold text-slate-900">{adminStats.totalUsers}</p>
                  </div>
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <p className="text-sm font-medium text-slate-500 mb-1">PRO Users</p>
                    <p className="text-3xl font-bold text-indigo-600">{adminStats.proUsers}</p>
                  </div>
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <p className="text-sm font-medium text-slate-500 mb-1">Free Users</p>
                    <p className="text-3xl font-bold text-slate-600">{adminStats.freeUsers}</p>
                  </div>
                </div>

                {/* Add Credits Form */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Manual Credit Adjustment</h3>
                  <form onSubmit={handleAddCredits} className="flex flex-col sm:flex-row gap-4">
                    <input
                      type="email"
                      placeholder="User Email"
                      value={addCreditsEmail}
                      onChange={(e) => setAddCreditsEmail(e.target.value)}
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={addCreditsAmount}
                      onChange={(e) => setAddCreditsAmount(Number(e.target.value))}
                      className="w-32 px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    <button
                      type="submit"
                      disabled={addingCredits}
                      className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {addingCredits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      Add Credits
                    </button>
                  </form>
                </div>

                {/* User List */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-900">Recent Users</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3">Email</th>
                          <th className="px-6 py-3">Tier</th>
                          <th className="px-6 py-3">Credits</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {adminStats.users.slice(0, 50).map((u: any) => (
                          <tr key={u.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-medium text-slate-900">{u.email || 'N/A'}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${u.tier === 'pro' || u.tier === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                                {u.tier}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-medium">{u.search_credits}</td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleToggleOg(u.id, !!u.is_og)}
                                disabled={togglingOg === u.id}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                                  u.is_og 
                                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {togglingOg === u.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                                ) : u.is_og ? (
                                  'Remove OG'
                                ) : (
                                  'Make OG'
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : currentView === 'hub' ? (
          <div className="w-full">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-slate-900">My Hub</h2>
              <button onClick={() => setCurrentView('search')} className="text-indigo-600 font-medium hover:text-indigo-700 flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Back to Search
              </button>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="md:col-span-1 space-y-6">
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <UserIcon className="w-5 h-5 text-indigo-600" /> Account Status
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-slate-500">Email</p>
                      <p className="font-medium text-slate-900">{userEmail || 'Guest'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Plan</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${userTier === 'pro' || userTier === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                          {userTier}
                        </span>
                        {isOG && (
                          <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-bold tracking-wider uppercase border border-amber-200">
                            <Sparkles className="w-3 h-3" />
                            OG
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Searches Remaining</p>
                      <p className="font-bold text-2xl text-indigo-600">
                        {userTier === 'pro' || userTier === 'admin' ? extraSearches : Math.max(0, 1 - dailyCount) + extraSearches}
                      </p>
                    </div>
                    {userTier === 'free' && (
                      <button onClick={() => setShowUpgradeModal(true)} className="w-full py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors text-sm">
                        Upgrade to PRO
                      </button>
                    )}
                    {userTier === 'pro' && (
                      <button 
                        onClick={handleManageSubscription} 
                        disabled={managingSub}
                        className="w-full py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm flex items-center justify-center gap-2"
                      >
                        {managingSub ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                        Manage Subscription
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Heart className="w-5 h-5 text-rose-500" /> Saved Bargains
                </h3>
                {savedDeals.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
                    <Heart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">You haven't saved any bargains yet.</p>
                    <button onClick={() => setCurrentView('search')} className="mt-4 text-indigo-600 font-bold hover:text-indigo-700">
                      Go find some deals
                    </button>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {savedDeals.map((saved, idx) => (
                      <div key={idx} className="relative">
                        <div className="absolute -top-3 -left-3 bg-slate-900 text-white text-[10px] font-bold px-3 py-1 rounded-full z-10 shadow-sm">
                          {saved.storeName}
                        </div>
                        <DiscountCard 
                          discount={saved.deal} 
                          onSave={() => toggleSaveDeal(saved.deal, saved.storeName)} 
                          isSaved={true} 
                        />
                      </div>
                    ))}
                  </div>
                )}

                <h3 className="text-xl font-bold text-slate-900 mt-12 mb-6 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-500" /> Tracked Brands
                </h3>
                {trackedBrands.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
                    <p className="text-slate-500 font-medium">You aren't tracking any brands yet.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {trackedBrands.map((brand, idx) => (
                      <div key={idx} className="bg-white rounded-2xl p-4 border border-slate-200 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                            <ShoppingBag className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{brand.name}</p>
                            {brand.hasNewDeals ? (
                              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> New deals found!
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500">Checking daily...</p>
                            )}
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            setCurrentView('search');
                            setQuery(brand.name);
                            handleSearch(undefined, brand.name);
                          }}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Search for deals"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <h3 className="text-xl font-bold text-slate-900 mt-12 mb-6 flex items-center gap-2">
                  <Search className="w-5 h-5 text-indigo-500" /> Search History
                </h3>
                {searchHistory.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
                    <p className="text-slate-500 font-medium">No search history yet.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="divide-y divide-slate-100">
                      {searchHistory.map((item, idx) => (
                        <div 
                          key={idx} 
                          className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer" 
                          onClick={() => { 
                            setCurrentView('search'); 
                            setQuery(item.query);
                            handleSearch(undefined, item.query); 
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Search className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-700">{item.query}</span>
                          </div>
                          <span className="text-xs text-slate-400">{new Date(item.timestamp).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Hero Section */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
              Find the best deals, <br />
              <span className="text-indigo-600">instantly.</span>
            </h1>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Our AI agent searches the web in real-time to find active discount codes and hidden promotions for your favorite stores.
            </p>
          </motion.div>

          {/* Search Bar */}
          <motion.form 
            onSubmit={handleSearch}
            className="mt-10 max-w-2xl mx-auto relative"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter store name (e.g. THE ICONIC)"
                className="w-full pl-12 pr-32 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none transition-all text-lg"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-2 top-2 bottom-2 px-6 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Search</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* Recent / Popular Suggestions */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {searchHistory.length > 0 ? (
                <>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider py-1">Recent:</span>
                  {searchHistory.slice(0, 5).map((item) => (
                    <button
                      key={item.query}
                      type="button"
                      onClick={() => {
                        setQuery(item.query);
                      }}
                      className="text-xs font-medium px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-full transition-colors"
                    >
                      {item.query}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider py-1">Popular:</span>
                  {popularStores.map((store) => (
                    <button
                      key={store}
                      type="button"
                      onClick={() => {
                        setQuery(store);
                      }}
                      className="text-xs font-medium px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors"
                    >
                      {store}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Gift Card Discounts Section */}
            <div className="mt-12 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <Ticket className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Gift Card Discounts</h2>
                    <p className="text-sm text-slate-500">Curated weekly deals for you</p>
                  </div>
                </div>
                {dealsLastUpdated && (
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Updated: {new Date(dealsLastUpdated + 'Z').toLocaleString()}
                    </div>
                    {userTier === 'admin' && (
                      <button 
                        type="button"
                        onClick={handleSyncDeals}
                        disabled={syncingDeals}
                        className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {syncingDeals ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Sync Now
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {giftCardDeals.map((deal, idx) => {
                  const CardContent = (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-shadow group h-full"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-wider">
                          {deal.store}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                          deal.type === 'next_week' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {deal.type === 'next_week' ? 'Next Week' : 'This Week'}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{deal.title}</h3>
                      <p className="text-sm text-slate-600 mt-1 font-medium">{deal.offer}</p>
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                        <Clock className="w-3 h-3" />
                        <span>{deal.dates}</span>
                      </div>
                    </motion.div>
                  );

                  return deal.link ? (
                    <a href={deal.link} target="_blank" rel="noopener noreferrer" key={idx} className="block h-full">
                      {CardContent}
                    </a>
                  ) : (
                    <div key={idx} className="block h-full">
                      {CardContent}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.form>
        </div>

        {/* Results Section */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 gap-4"
            >
              <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                <Sparkles className="w-6 h-6 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-slate-500 font-medium animate-pulse">Agent is scouring the web for deals...</p>
            </motion.div>
          )}

          {error && (
            <motion.div 
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-center"
            >
              {error}
            </motion.div>
          )}

          {result && !loading && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">{result.storeName}</h2>
                  <p className="text-slate-500 mt-1">{result.summary}</p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg">
                    <Sparkles className="w-4 h-4" />
                    <span>{result.codes.length} deals found</span>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {result.storeUrl && (
                      <a
                        href={result.storeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm font-semibold text-white bg-indigo-600 px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-sm"
                      >
                        <ShoppingBag className="w-4 h-4" />
                        Shop at {result.storeName}
                      </a>
                    )}
                    <button
                      onClick={() => toggleTrackBrand(result.storeName)}
                      className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm ${
                        trackedBrands.some(b => b.name === result.storeName)
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {trackedBrands.some(b => b.name === result.storeName) ? (
                        <><CheckCircle2 className="w-4 h-4" /> Tracking</>
                      ) : (
                        <><Clock className="w-4 h-4" /> Track Brand</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {result.codes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {result.codes.map((discount, index) => (
                    <motion.div
                      key={discount.code + index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <DiscountCard 
                        discount={discount} 
                        onSave={() => toggleSaveDeal(discount, result.storeName)}
                        isSaved={savedDeals.some(d => d.storeName === result.storeName && d.deal.description === discount.description)}
                      />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                  <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900">No specific codes found</h3>
                  <p className="text-slate-500 max-w-md mx-auto mt-2">
                    We couldn't find any copy-pasteable codes right now, but check the store's website for automatic discounts.
                  </p>
                </div>
              )}

              {/* Ask for Discount Section */}
              <div className="mt-12 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-3xl p-8 border border-indigo-100 text-center">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Mail className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">No luck? Ask them directly!</h3>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-[10px] font-bold uppercase tracking-wider mb-4">
                  <Zap className="w-3 h-3 fill-current" />
                  PRO Feature
                </div>
                <p className="text-slate-600 mb-6 max-w-md mx-auto">
                  Let our AI write a persuasive, polite email to {result.storeName} explaining you're a loyal student fan on a budget.
                </p>
                <button
                  onClick={handleGenerateEmail}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-2 mx-auto"
                >
                  {userTier === 'free' ? <ShieldCheck className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                  {userTier === 'free' ? 'Unlock PRO to Generate Email' : 'Generate "Student Begging" Email'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4 opacity-50">
            <ShoppingBag className="w-5 h-5" />
            <span className="font-bold text-lg tracking-tight">BargainAgent</span>
          </div>
          <p className="text-slate-400 text-sm">
            Powered by Gemini AI & Google Search. <br />
            Always verify codes before checkout.
          </p>
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-slate-500 text-xs font-medium">
              Created by <span className="text-slate-900">Captain Boat</span>
            </p>
            <a 
              href="https://www.xiaohongshu.com/user/profile/5f3929be000000000101f29a" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-rose-500 hover:text-rose-600 transition-colors text-xs font-semibold"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
              Follow on 小红书 (Xiaohongshu)
            </a>
          </div>
        </div>
      </footer>

      {/* Email Template Modal */}
      <AnimatePresence>
        {showEmailModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEmailModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-slate-900">Your Email Template</h3>
                <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>
              
              {generatingEmail ? (
                <div className="py-12 flex flex-col items-center justify-center text-indigo-600">
                  <Loader2 className="w-10 h-10 animate-spin mb-4" />
                  <p className="font-medium">Crafting the perfect polite email...</p>
                </div>
              ) : emailTemplate ? (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <p className="text-sm font-bold text-slate-500 mb-1">Subject:</p>
                    <p className="text-slate-900 font-medium">{emailTemplate.subject}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 whitespace-pre-wrap text-slate-700 font-medium text-sm h-64 overflow-y-auto">
                    {emailTemplate.body}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`Subject: ${emailTemplate.subject}\n\n${emailTemplate.body}`);
                      setEmailCopied(true);
                      setTimeout(() => setEmailCopied(false), 2000);
                    }}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                  >
                    {emailCopied ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                    {emailCopied ? "Copied to Clipboard!" : "Copy Full Email"}
                  </button>
                </div>
              ) : (
                <p className="text-red-500">Failed to generate email. Please try again.</p>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Subscription Modal */}
      <AnimatePresence>
        {showSubModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSubModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
              
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                  <Clock className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Daily Deal Alerts</h3>
                <p className="text-slate-500 mb-8">
                  We'll scan the web every morning and email you if we find new codes or perks for <span className="font-semibold text-slate-900">{result?.storeName}</span>.
                </p>

                {subSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-2 text-emerald-600 font-semibold"
                  >
                    <CheckCircle2 className="w-12 h-12" />
                    <span>You're subscribed!</span>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubscribe} className="w-full space-y-4">
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email address"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={subscribing}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                    >
                      {subscribing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Start Tracking"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSubModal(false)}
                      className="w-full py-2 text-slate-400 text-sm font-medium hover:text-slate-600 transition-colors"
                    >
                      Maybe later
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* How it works Modal */}
      <AnimatePresence>
        {showHowItWorks && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHowItWorks(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
                <Search className="absolute -right-4 -top-4 w-32 h-32 opacity-10 rotate-12" />
                <div className="relative z-10">
                  <h3 className="text-3xl font-bold mb-2">How it works</h3>
                  <p className="text-indigo-100 opacity-90">Your guide to finding the best deals with BargainAgent.</p>
                </div>
              </div>

              <div className="p-8">
                <div className="space-y-6 mb-8">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">1</div>
                    <div>
                      <h4 className="font-bold text-slate-900">Search for Deals</h4>
                      <p className="text-sm text-slate-500 mt-1">Enter a store name to find active discount codes and gift card deals. You get 1 free search every day.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">2</div>
                    <div>
                      <h4 className="font-bold text-slate-900">Need More Searches?</h4>
                      <p className="text-sm text-slate-500 mt-1">Hit your daily limit? Click 'Upgrade' to buy a voucher for 50 extra searches for just $9.90.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">3</div>
                    <div>
                      <h4 className="font-bold text-slate-900">Redeem Your Code</h4>
                      <p className="text-sm text-slate-500 mt-1">Enter your unique voucher code in the 'Redeem Voucher' box. Your extra searches are added instantly and never expire!</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowHowItWorks(false)}
                  className="w-full py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upgrade Modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUpgradeModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
                <Sparkles className="absolute -right-4 -top-4 w-32 h-32 opacity-10 rotate-12" />
                <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold mb-4 backdrop-blur-sm">
                    <Sparkles className="w-3 h-3 fill-current" />
                    PRO MEMBERSHIP
                  </div>
                  <h3 className="text-3xl font-bold mb-2">Unlock Pro Features</h3>
                  <p className="text-indigo-100 opacity-90">
                    Get 100 AI searches every month. Try it free for <span className="line-through opacity-70">7</span> <span className="font-bold text-white">30</span> days.
                  </p>
                </div>
              </div>

              <div className="p-8">
                {dailyCount >= 1 && userTier === 'free' && extraSearches <= 0 && (
                  <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">Daily limit reached</p>
                      <p className="text-xs text-amber-700">You've used your 1 free search for today. Upgrade to keep searching!</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4 mb-8">
                  {[
                    { icon: <Zap className="w-4 h-4" />, text: "100 real-time AI searches per month" },
                    { icon: <Clock className="w-4 h-4" />, text: "30-day free trial", badge: "Limited time" },
                    { icon: <Ticket className="w-4 h-4" />, text: "Pro membership exclusive discount codes (Coming soon)" },
                    { icon: <ShieldCheck className="w-4 h-4" />, text: "Paid membership access (UNiDAYS, Student Beans, Entertainment Group)" },
                    { icon: <CreditCard className="w-4 h-4" />, text: "Cancel anytime" }
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center gap-3 text-slate-600">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        {feature.icon}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{feature.text}</span>
                        {feature.badge && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                            {feature.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  {upgradeError && (
                    <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{upgradeError}</span>
                    </div>
                  )}
                  <button
                    onClick={handleUpgrade}
                    disabled={upgrading}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 text-center relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                    {upgrading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Start 1-Month Free Trial"}
                  </button>
                  <p className="text-xs text-slate-400 text-center mt-2">
                    $10.00/month after trial. Auto-renews.
                  </p>
                  
                  <button
                    onClick={() => setShowUpgradeModal(false)}
                    className="w-full py-2 text-slate-400 text-sm font-medium hover:text-slate-600 transition-colors mt-2"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
