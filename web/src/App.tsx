import { useEffect, useMemo, useState } from 'react';
import type { ScenarioData, Variable } from './types';

const CATEGORY_COLORS: Record<string, string> = {
  Response: 'bg-blue-100 text-blue-800',
  Event: 'bg-green-100 text-green-800',
  Drug: 'bg-orange-100 text-orange-800',
  Other: 'bg-gray-100 text-gray-700',
};

const TYPE_COLORS: Record<string, string> = {
  standard: 'bg-indigo-100 text-indigo-800',
  custom: 'bg-pink-100 text-pink-800',
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

function useData() {
  const [data, setData] = useState<ScenarioData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  return { data, error };
}

export default function App() {
  const { data, error } = useData();

  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'standard' | 'custom'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [manikinFilter, setManikinFilter] = useState<string>('all');
  const [minCount, setMinCount] = useState(1);
  const [minPercent, setMinPercent] = useState(0);
  const [sortKey, setSortKey] = useState<'usedInCount' | 'usedInPercent' | 'id'>('usedInCount');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const allManikins = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.scenarios.map((s) => s.manikin))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.variables.filter((v) => {
      if (typeFilter !== 'all' && v.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && v.category !== categoryFilter) return false;
      if (manikinFilter !== 'all' && !v.manikins.includes(manikinFilter)) return false;
      if (v.usedInCount < minCount) return false;
      if (v.usedInPercent < minPercent) return false;
      if (searchText && !v.id.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [data, typeFilter, categoryFilter, manikinFilter, minCount, minPercent, searchText]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] as string | number;
      const vb = b[sortKey] as string | number;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
    setPage(1);
  }

  function resetFilters() {
    setSearchText('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setManikinFilter('all');
    setMinCount(1);
    setMinPercent(0);
    setPage(1);
  }

  const SortIcon = ({ col }: { col: typeof sortKey }) =>
    sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  if (error) return (
    <div className="min-h-screen flex items-center justify-center text-red-600">
      Failed to load data.json: {error}
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Loading…
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="max-w-screen-xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Laerdal Scenario Variable Analyzer</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data.sampledScenarios
              ? `Sample: ${data.totalScenarios} scenarios · `
              : `${data.totalScenarios} scenarios · `}
            {data.variables.length} unique variables ·{' '}
            Generated {new Date(data.generated).toLocaleString()}
          </p>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Scenarios', value: data.totalScenarios },
            { label: 'Unique Variables', value: data.variables.length },
            { label: 'Standard', value: data.variables.filter((v) => v.type === 'standard').length },
            { label: 'Custom', value: data.variables.filter((v) => v.type === 'custom').length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <div className="text-3xl font-bold text-indigo-600">{value.toLocaleString()}</div>
              <div className="text-sm text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-600 mb-1">Search ID</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                placeholder="e.g. HeartRate, Custom.Event"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value as typeof typeFilter); setPage(1); }}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="all">All types</option>
                <option value="standard">Standard (Laerdal)</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="all">All categories</option>
                <option value="Response">Response</option>
                <option value="Event">Event</option>
                <option value="Drug">Drug</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Manikin */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Manikin</label>
              <select
                value={manikinFilter}
                onChange={(e) => { setManikinFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="all">All manikins</option>
                {allManikins.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Reset */}
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
            >
              Reset
            </button>
          </div>

          {/* Sliders */}
          <div className="flex flex-wrap gap-6">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Min usage count: <span className="text-indigo-600 font-bold">{minCount}</span>
              </label>
              <input
                type="range" min={1} max={data.totalScenarios} value={minCount}
                onChange={(e) => { setMinCount(Number(e.target.value)); setPage(1); }}
                className="w-full accent-indigo-600"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Min % of scenarios: <span className="text-indigo-600 font-bold">{minPercent}%</span>
              </label>
              <input
                type="range" min={0} max={100} value={minPercent}
                onChange={(e) => { setMinPercent(Number(e.target.value)); setPage(1); }}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{sorted.length.toLocaleString()} variables matching filters</span>
          <span>Page {page} of {totalPages}</span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => toggleSort('id')}
                >
                  Variable ID<SortIcon col="id" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => toggleSort('usedInCount')}
                >
                  Count<SortIcon col="usedInCount" />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => toggleSort('usedInPercent')}
                >
                  % of scenarios<SortIcon col="usedInPercent" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Manikins</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((v: Variable) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800 max-w-xs break-all">{v.id}</td>
                  <td className="px-4 py-2.5">
                    <Badge label={v.type} colorClass={TYPE_COLORS[v.type] ?? ''} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge label={v.category} colorClass={CATEGORY_COLORS[v.category] ?? ''} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{v.usedInCount}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full"
                          style={{ width: `${v.usedInPercent}%` }}
                        />
                      </div>
                      <span className="w-12 text-right">{v.usedInPercent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs">
                    {v.manikins.join(', ')}
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No variables match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const p = page <= 4 ? i + 1 : page - 3 + i;
              if (p < 1 || p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1 border rounded ${p === page ? 'bg-indigo-600 text-white border-indigo-600' : 'hover:bg-gray-50'}`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
