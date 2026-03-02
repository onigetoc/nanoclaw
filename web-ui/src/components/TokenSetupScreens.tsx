import { apiService, type ApiToken } from '../api';

interface CreateTokenProps {
  isDark: boolean;
  setNewToken: (t: ApiToken) => void;
  setToken: (t: string) => void;
  setShowTokenSetup: (v: boolean) => void;
}

export function CreateTokenScreen({ isDark, setNewToken, setToken, setShowTokenSetup }: CreateTokenProps) {
  const handleCreateToken = async () => {
    try {
      const createdToken = await apiService.createToken('Web UI');
      setNewToken(createdToken);
      setToken(createdToken.token);
    } catch (err) {
      console.error('Failed to create token:', err);
    }
  };

  return (
    <div className={`flex min-h-screen items-center justify-center px-4 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
      <div className={`w-full max-w-md rounded-2xl p-8 text-center shadow-xl ${isDark ? 'border border-zinc-800 bg-zinc-900' : 'border border-zinc-300 bg-white'}`}>
        <h1 className="mb-2 text-3xl font-semibold">Create Token</h1>
        <p className="mb-6 text-zinc-400">Generate a new API token to connect</p>
        <button
          onClick={handleCreateToken}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500"
        >
          Generate Token
        </button>
        <button
          className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-medium text-zinc-200 transition hover:bg-zinc-700"
          onClick={() => setShowTokenSetup(false)}
        >
          Back
        </button>
      </div>
    </div>
  );
}

interface TokenCreatedProps {
  isDark: boolean;
  newToken: ApiToken;
  setToken: (t: string) => void;
  setNewToken: (t: ApiToken | null) => void;
}

export function TokenCreatedScreen({ isDark, newToken, setToken, setNewToken }: TokenCreatedProps) {
  return (
    <div className={`flex min-h-screen items-center justify-center px-4 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
      <div className={`w-full max-w-md rounded-2xl p-8 text-center shadow-xl ${isDark ? 'border border-zinc-800 bg-zinc-900' : 'border border-zinc-300 bg-white'}`}>
        <h1 className="mb-2 text-3xl font-semibold">Token Created!</h1>
        <p className="mb-4 text-zinc-400">Copy this token - you won&apos;t see it again:</p>
        <code className={`mb-4 block break-all rounded-lg p-4 text-left text-sm ${isDark ? 'border border-zinc-700 bg-zinc-800 text-zinc-100' : 'border border-zinc-300 bg-zinc-50 text-zinc-900'}`}>
          {newToken.token}
        </code>
        <button
          onClick={() => { void navigator.clipboard.writeText(newToken.token); }}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-medium text-zinc-200 transition hover:bg-zinc-700"
        >
          Copy to Clipboard
        </button>
        <button
          className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500"
          onClick={() => { setToken(newToken.token); setNewToken(null); }}
        >
          I&apos;ve saved my token
        </button>
      </div>
    </div>
  );
}
