import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  const { action } = req.query;
  const method = req.method;

  if (method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, email } = req.body;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing' });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  try {
    switch (action) {
      case 'init':
        return res.status(200).json({ 
          user: { id: userId, tier: 'free' }, 
          dailyCount: 0, 
          extraSearches: 0 
        });

      case 'sync': {
        const { data: profile, error: fetchError } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        let isOG = authUser?.user?.user_metadata?.is_og;
        if (isOG === undefined) {
          isOG = email === 'nswitch1101@gmail.com';
        }

        let userTier = email === 'botaoshen@gmail.com' ? 'admin' : 'free';
        let searchCredits = 5;

        if (!profile && !fetchError) {
          await supabaseAdmin.from('profiles').insert({
            id: userId,
            email: email,
            tier: userTier,
            search_credits: searchCredits
          });
        } else if (profile) {
          userTier = email === 'botaoshen@gmail.com' ? 'admin' : profile.tier;
          searchCredits = profile.search_credits;
          if (email && profile.email !== email) {
            await supabaseAdmin.from('profiles').update({ email }).eq('id', userId);
          }
        }

        const dailyCount = searchCredits > 0 ? 0 : 1;
        return res.status(200).json({ 
          user: { id: userId, email, tier: userTier, isOG }, 
          dailyCount: dailyCount, 
          extraSearches: searchCredits 
        });
      }

      case 'log-search': {
        if (userId.startsWith('guest-') || !userId.includes('-')) {
          return res.status(200).json({ success: true, newCount: 1, extraSearches: 0 });
        }

        const { data: profile, error: fetchError } = await supabaseAdmin
          .from('profiles')
          .select('tier, search_credits')
          .eq('id', userId)
          .single();

        if (profile && !fetchError) {
          if (profile.tier !== 'admin' && profile.search_credits <= 0) {
            return res.status(403).json({ error: "Monthly limit reached" });
          }
          
          if (profile.tier !== 'admin') {
            const newCredits = Math.max(0, profile.search_credits - 1);
            await supabaseAdmin
              .from("profiles")
              .update({ search_credits: newCredits })
              .eq("id", userId);
              
            return res.status(200).json({ 
              success: true, 
              newCount: newCredits > 0 ? 0 : 1, 
              extraSearches: newCredits 
            });
          }
          return res.status(200).json({ success: true, newCount: 0, extraSearches: profile.search_credits });
        }
        return res.status(200).json({ success: true, newCount: 1, extraSearches: 0 });
      }

      case 'claim-iconic-code': {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        const isOG = authUser?.user?.user_metadata?.is_og;

        if (!isOG) {
          return res.status(403).json({ error: "Only OG users can claim daily Iconic codes." });
        }

        const today = new Date().toISOString().split('T')[0];
        const startOfDay = `${today}T00:00:00.000Z`;
        const endOfDay = `${today}T23:59:59.999Z`;

        const { data: existingClaim } = await supabaseAdmin
          .from('iconic_codes')
          .select('*')
          .eq('claimed_by', userId)
          .gte('claimed_at', startOfDay)
          .lte('claimed_at', endOfDay)
          .maybeSingle();

        if (existingClaim) {
          return res.status(200).json({ 
            success: true, 
            alreadyClaimed: true, 
            code: existingClaim.code,
            message: "You have already claimed your code for today!" 
          });
        }

        const { data: availableCode } = await supabaseAdmin
          .from('iconic_codes')
          .select('*')
          .is('claimed_by', null)
          .limit(1)
          .maybeSingle();

        if (!availableCode) {
          return res.status(404).json({ error: "No available Iconic codes in the library." });
        }

        const { data: updatedCode, error: updateError } = await supabaseAdmin
          .from('iconic_codes')
          .update({ 
            claimed_by: userId, 
            claimed_at: new Date().toISOString() 
          })
          .eq('id', availableCode.id)
          .select()
          .single();

        if (updateError) throw updateError;

        return res.status(200).json({ 
          success: true, 
          code: updatedCode.code,
          message: "Successfully claimed your daily Iconic code!" 
        });
      }

      default:
        return res.status(400).json({ error: "Invalid action" });
    }
  } catch (error: any) {
    console.error(`Error in /api/user action ${action}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
}
