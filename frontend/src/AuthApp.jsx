import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import App from './App.jsx';

export default function AuthApp() {
  const [session, setSession] = useState(undefined);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, value) => setSession(value));
    return () => subscription.unsubscribe();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const result = mode === 'login' ? await supabase.auth.signInWithPassword({email,password}) : await supabase.auth.signUp({email,password});
    setMessage(result.error?.message || (mode === 'register' ? 'Check your email for confirmation if required.' : ''));
    setBusy(false);
  }
  if (session === undefined) return <main className="p-10">Loading...</main>;
  if (session) return <App session={session} onSignOut={() => supabase.auth.signOut()} />;
  return <main className="min-h-screen bg-slate-950 grid place-items-center p-6"><form onSubmit={submit} className="bg-white p-8 rounded-2xl w-full max-w-md space-y-5"><h1 className="text-2xl font-bold">GrowthPilot AI</h1><p>{mode === 'login' ? 'Sign in' : 'Create an account'}</p><label className="block">Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="block border p-3 w-full rounded-lg mt-2"/></label><label className="block">Password<input required minLength={6} type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} className="block border p-3 w-full rounded-lg mt-2"/></label>{message && <p role="status" className="text-sm text-indigo-700">{message}</p>}<button disabled={busy} className="bg-indigo-600 text-white p-3 rounded-lg w-full">{busy?'Working...':mode==='login'?'Sign in':'Sign up'}</button><button type="button" onClick={()=>{setMode(mode==='login'?'register':'login');setMessage('')}} className="text-indigo-600 underline text-sm">Switch to {mode==='login'?'sign up':'sign in'}</button></form></main>;
}
