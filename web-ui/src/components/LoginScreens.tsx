import { type FormEvent } from 'react';
import { apiService } from '../api';

interface LoginFormProps {
  isDark: boolean;
  tokenInput: string;
  setTokenInput: (v: string) => void;
  setToken: (v: string) => void;
  setShowTokenSetup: (v: boolean) => void;
  forceUpdate: () => void;
}

export function LoginScreen({ isDark, tokenInput, setTokenInput, setToken, setShowTokenSetup, forceUpdate }: LoginFormProps) {
  const savedToken = apiService.getToken();

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      setToken(tokenInput.trim());
    }
  };

  if (savedToken) {
    return (
      <div className={`flex min-h-screen items-center justify-center px-4 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
        <div className={`w-full max-w-md rounded-2xl p-8 text-center shadow-xl ${isDark ? 'border border-zinc-800 bg-zinc-900' : 'border border-zinc-300 bg-white'}`}>
          <h1 className="mb-2 text-3xl font-semibold">EureClaw</h1>
          <p className="mb-6 text-zinc-400">Disconnected</p>
          <button
            className="mb-3 w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500"
            onClick={() => setToken(savedToken)}
            autoFocus
          >
            Connect
          </button>
          <button
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-medium text-zinc-200 transition hover:bg-zinc-700"
            onClick={() => {
              apiService.clearToken();
              forceUpdate();
            }}
          >
            Forget Token
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen items-center justify-center px-4 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
      <div className={`w-full max-w-md rounded-2xl p-8 text-center shadow-xl ${isDark ? 'border border-zinc-800 bg-zinc-900' : 'border border-zinc-300 bg-white'}`}>
        <h1 className="mb-2 text-3xl font-semibold">EureClaw</h1>
        <p className="mb-6 text-zinc-400">Connect to your assistant</p>
        <form className="space-y-3" onSubmit={handleLogin}>
          <input
            type="text"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Enter your API token"
            autoFocus
            className={`w-full rounded-lg px-4 py-3 outline-none ring-emerald-500 focus:ring-2 ${isDark ? 'border border-zinc-700 bg-zinc-800 text-zinc-100' : 'border border-zinc-300 bg-white text-zinc-900'}`}
          />
          <button
            type="submit"
            disabled={!tokenInput.trim()}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Connect
          </button>
        </form>
        <button
          className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-medium text-zinc-200 transition hover:bg-zinc-700"
          onClick={() => setShowTokenSetup(true)}
        >
          Create New Token
        </button>
      </div>
    </div>
  );
}
