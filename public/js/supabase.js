// js/supabase.js - Supabase 初始化配置
const SUPABASE_URL = 'https://fxamzzyttryxukhcjgpw.supabase.co'; // 從金鑰解析出的 Project URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YW16enl0dHJ5eHVraGNqZ3B3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NDUxMDIsImV4cCI6MjA5MTMyMTEwMn0.S0JA97ba8Oax7vqhWSuAof9qN3OssEP2h9kbMFerF7o';

let supabaseInstance = null;

function getSupabase() {
    if (!supabaseInstance) {
        if (typeof supabase !== 'undefined') {
            supabaseInstance = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } else {
            console.error("Supabase SDK 未載入");
        }
    }
    return supabaseInstance;
}

window.getSupabase = getSupabase;
