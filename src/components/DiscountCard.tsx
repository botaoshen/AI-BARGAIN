import React, { useState } from 'react';
import { Copy, ExternalLink, CheckCircle2, Clock, AlertCircle, Gift, CreditCard, Percent, ShieldCheck, Zap, CalendarDays } from 'lucide-react';
import { DiscountCode } from '../services/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DiscountCardProps {
  discount: DiscountCode;
}

export const DiscountCard: React.FC<DiscountCardProps> = ({ discount }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    if (discount.code === 'N/A' || !discount.code) return;
    navigator.clipboard.writeText(discount.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const confidenceColors = {
    high: "text-emerald-600 bg-emerald-50 border-emerald-100",
    medium: "text-amber-600 bg-amber-50 border-amber-100",
    low: "text-slate-500 bg-slate-50 border-slate-100"
  };

  const typeConfig = {
    code: { icon: <Percent className="w-4 h-4" />, label: "Promo Code", color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
    giftcard: { icon: <Gift className="w-4 h-4" />, label: "Gift Card Deal", color: "text-rose-600 bg-rose-50 border-rose-100" },
    cashback: { icon: <CreditCard className="w-4 h-4" />, label: "Cashback", color: "text-cyan-600 bg-cyan-50 border-cyan-100" },
    membership: { icon: <ShieldCheck className="w-4 h-4" />, label: "Bank/Membership", color: "text-amber-600 bg-amber-50 border-amber-100" },
    perk: { icon: <Zap className="w-4 h-4" />, label: "Provider Perk", color: "text-violet-600 bg-violet-50 border-violet-100" },
    sale: { icon: <CalendarDays className="w-4 h-4" />, label: "Sale Alert", color: "text-orange-600 bg-orange-50 border-orange-100" }
  };

  const currentType = typeConfig[discount.type] || typeConfig.code;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className={cn(
              "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border flex items-center gap-1",
              currentType.color
            )}>
              {currentType.icon}
              {currentType.label}
            </div>
            <div className={cn(
              "text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border",
              confidenceColors[discount.confidence]
            )}>
              {discount.confidence} confidence
            </div>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 leading-tight mt-1">
            {discount.description}
          </h3>
        </div>
        {discount.type === 'code' && discount.code !== 'N/A' && (
          <button 
            onClick={copyToClipboard}
            className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-indigo-600"
            title="Copy code"
          >
            {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4 mt-auto">
        {discount.type === 'code' && discount.code !== 'N/A' ? (
          <div className="discount-code-badge flex-1 text-center py-2 text-lg tracking-widest">
            {discount.code}
          </div>
        ) : (
          <div className="flex-1 py-2 text-sm font-medium text-slate-500 bg-slate-50 rounded-md border border-slate-100 text-center italic">
            {discount.type === 'giftcard' ? 'Check source for gift card purchase' : 
             discount.type === 'membership' ? 'Check your Bank/Member App' :
             discount.type === 'perk' ? 'Check your Provider Portal (e.g. Origin)' :
             discount.type === 'sale' ? 'Annual/Special Event Alert' :
             'Activate via cashback portal'}
          </div>
        )}
      </div>

      {discount.verificationStatus && (
        <div className={cn(
          "mb-4 p-2 rounded-lg border flex items-start gap-2",
          discount.verificationStatus.includes("To be verified") 
            ? "bg-amber-50/50 border-amber-100 text-amber-700" 
            : "bg-indigo-50/50 border-indigo-100 text-indigo-700"
        )}>
          {discount.verificationStatus.includes("To be verified") 
            ? <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
          }
          <div className="text-xs">
            <span className="font-semibold">Verification: </span>
            {discount.verificationStatus}
            {discount.lastVerified && <span className={cn(
              "block mt-0.5",
              discount.verificationStatus.includes("To be verified") ? "text-amber-500" : "text-indigo-500"
            )}>Last reported: {discount.lastVerified}</span>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          {discount.expiry ? (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>Expires: {discount.expiry}</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Expiry unknown</span>
            </>
          )}
        </div>
        <a 
          href={discount.sourceUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-indigo-600 transition-colors font-medium"
        >
          View Deal <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
