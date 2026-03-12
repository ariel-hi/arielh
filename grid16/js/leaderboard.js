import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://pokkfedjpgvcndiydhat.supabase.co';
const supabaseKey = 'sb_publishable_n834HRayITdgwmdhcnejfA_l0KmlCPA';

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function submitScore({ name, score }) {
    // Only saving name and score per the SQL schema created
    const { error } = await supabase
        .from('leaderboard')
        .insert([{ name: name.toUpperCase(), score: Math.round(score * 10) }]);

    if (error) {
        console.error('Error submitting score:', error);
    }
}

export async function fetchLeaderboard(limit = 10) {
    const { data, error } = await supabase
        .from('leaderboard')
        .select('name, score')
        .order('score', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching scores:', error);
        return [];
    }
    return (data || []).map(r => ({ name: r.name, score: r.score / 10 }));
}
