import { useState, useEffect } from 'react';
import { Search, Sparkles, ShoppingBag, Loader2, ArrowRight, Clock, CheckCircle2, CalendarDays, Mail, Copy, Ticket, CreditCard, ShieldCheck, Zap, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { findDiscountCodes, generateDiscountEmail, getGiftCardDeals, BargainResult, GiftCardDeal } from './services/gemini';
import { DiscountCard } from './components/DiscountCard';

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

  // User & Limits State
  const [userId, setUserId] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<'free' | 'pro'>('free');
  const [dailyCount, setDailyCount] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    const initUser = async () => {
      let id = localStorage.getItem('bargain_user_id');
      if (!id) {
        id = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('bargain_user_id', id);
      }
      setUserId(id);

      try {
        const res = await fetch('/api/user/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: id })
        });
        const data = await res.json();
        if (data.user) {
          setUserTier(data.user.tier);
          setDailyCount(data.dailyCount);
        }
      } catch (err) {
        console.error("Failed to init user", err);
      }
    };

    const fetchGiftCards = async () => {
      const deals = await getGiftCardDeals();
      setGiftCardDeals(deals);
    };
    
    initUser();
    fetchGiftCards();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !userId) return;

    // Check limit client-side first for better UX
    if (userTier === 'free' && dailyCount >= 5) {
      setShowUpgradeModal(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Log search and check limit server-side
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

      const logData = await logRes.json();
      setDailyCount(logData.newCount);

      const data = await findDiscountCodes(query);
      setResult(data);
    } catch (err) {
      setError('Failed to find deals. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = () => {
    if (!userId) return;
    
    // Added /4.99 to pre-fill the amount
    const paymentLink = "https://paypal.me/botaoshen/4.99";
    
    // 1. Try to open in a new tab immediately (best for bypassing iframe restrictions)
    const newWin = window.open(paymentLink, '_blank');
    
    // 4. If window.open failed (popup blocked), we'll let the user click the manual link in the UI
    if (!newWin) {
      setError("Popup blocked. Please click the manual link below or enable popups.");
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">BargainAgent</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-6 text-sm font-medium text-slate-500">
            <div className={`flex items-center gap-2 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs transition-all ${
              userTier === 'pro' 
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' 
                : 'bg-slate-100 text-slate-600'
            }`}>
              {userTier === 'pro' && <Zap className="w-3 h-3 fill-current" />}
              <span className="font-bold">
                {userTier === 'pro' ? 'PRO' : 'Free'}
              </span>
              {userTier === 'free' && (
                <span className="text-slate-400 hidden xs:inline border-l border-slate-200 ml-1 pl-2">
                  {5 - dailyCount} left
                </span>
              )}
            </div>
            <a href="#" className="hidden md:inline hover:text-indigo-600 transition-colors">How it works</a>
            {userTier === 'pro' && (
              <button 
                onClick={async () => {
                  if (!userId) return;
                  await fetch('/api/user/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId })
                  });
                  setUserTier('free');
                  setDailyCount(0);
                }}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors underline"
              >
                Reset (Test)
              </button>
            )}
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

            {/* Popular Suggestions */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
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
            </div>

            {/* Gift Card Discounts Section */}
            <div className="mt-12 text-left">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <Ticket className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Gift Card Discounts</h2>
                    <p className="text-sm text-slate-500">Curated weekly deals for you</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {giftCardDeals.map((deal, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-shadow group"
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
                ))}
              </div>
            </div>

            {/* Live Sale Alerts Section */}
            <div className="mt-16 text-left">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1.5 h-6 bg-orange-500 rounded-full" />
                <h2 className="text-xl font-bold text-slate-900">Live Sale Alerts</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { store: "L'Oréal", event: "Family & Friends Sale", timing: "Expected March", status: "Rumored" },
                  { store: "Estée Lauder", event: "Warehouse Sale", timing: "Annual Event", status: "Coming Soon" },
                  { store: "Nike", event: "End of Season Clearance", timing: "Live Now", status: "Verified" }
                ].map((sale, idx) => (
                  <div 
                    key={idx}
                    onClick={() => { setQuery(sale.store); }}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                        {sale.status}
                      </span>
                      <CalendarDays className="w-4 h-4 text-slate-300 group-hover:text-orange-500 transition-colors" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg">{sale.store}</h3>
                    <p className="text-slate-500 text-sm mt-1">{sale.event}</p>
                    <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{sale.timing}</span>
                    </div>
                  </div>
                ))}
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
                  <button
                    onClick={() => setShowSubModal(true)}
                    className="flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 px-4 py-2 rounded-xl hover:bg-slate-800 transition-all shadow-sm"
                  >
                    <Clock className="w-4 h-4" />
                    Subscribe to Daily Alerts
                  </button>
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
                      <DiscountCard discount={discount} />
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
                <Zap className="absolute -right-4 -top-4 w-32 h-32 opacity-10 rotate-12" />
                <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold mb-4 backdrop-blur-sm">
                    <Zap className="w-3 h-3 fill-current" />
                    UNLIMITED ACCESS
                  </div>
                  <h3 className="text-3xl font-bold mb-2">Upgrade to PRO</h3>
                  <p className="text-indigo-100 opacity-90">Unlock unlimited searches and premium features.</p>
                </div>
              </div>

              <div className="p-8">
                {dailyCount >= 5 && userTier === 'free' && (
                  <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">Daily limit reached</p>
                      <p className="text-xs text-amber-700">You've used all 5 free searches for today. Upgrade now to keep searching!</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4 mb-8">
                  {[
                    { icon: <Zap className="w-4 h-4" />, text: "Unlimited real-time searches" },
                    { icon: <ShieldCheck className="w-4 h-4" />, text: "Priority deal verification" },
                    { icon: <Mail className="w-4 h-4" />, text: "Instant email alerts for new codes" },
                    { icon: <Sparkles className="w-4 h-4" />, text: "AI-powered custom email templates" }
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center gap-3 text-slate-600">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        {feature.icon}
                      </div>
                      <span className="text-sm font-medium">{feature.text}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleUpgrade}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 text-center"
                  >
                    Upgrade Now - $4.99/mo
                  </button>
                  <a 
                    href="https://paypal.me/botaoshen/4.99" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 font-medium hover:underline"
                  >
                    Click here if the page didn't open
                  </a>
                  <button
                    onClick={() => setShowUpgradeModal(false)}
                    className="w-full py-2 text-slate-400 text-sm font-medium hover:text-slate-600 transition-colors"
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
