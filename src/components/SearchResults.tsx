import React from 'react';
import { Flag, Plus, Search, User, Wrench } from 'lucide-react';
import { useApp } from '../state/AppState';
import { useSearch } from '../hooks/queries';
import { fmtDateTime } from '../domain/time';
import { Button, Spinner } from './ui';

export function SearchResults({ query }: { query: string }) {
  const app = useApp();
  const searchQ = useSearch(query);

  const results = searchQ.data?.results || [];

  return (
    <div className="h-full overflow-y-auto thin-scroll p-4 md:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Search Results for <span className="font-mono text-brand-600">"{query}"</span>
            </h2>
            <p className="text-xs text-slate-500">
              Found {results.length} matching job cards
            </p>
          </div>
          <Button size="sm" tone="ghost" onClick={() => app.setSearchQuery('')}>
            Back to Bay Timeline
          </Button>
        </div>

        {searchQ.isLoading && <Spinner label="Searching records…" />}

        {!searchQ.isLoading && results.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
            No matching vehicles or job card numbers found for "{query}".
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {results.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-brand-400 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-slate-900">
                  {r.registration_no}
                </span>
                <span className="text-xs text-slate-400 font-semibold">{r.jc_number}</span>
              </div>

              <div className="mt-1 text-xs text-slate-600">{r.model}</div>
              <div className="text-xs text-slate-500 mt-0.5">{r.customer_name} · {r.service_type}</div>

              <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                <span className="flex items-center gap-1 font-semibold text-brand-700">
                  <Flag className="h-3 w-3" /> PTD: {fmtDateTime(r.ptd)}
                </span>

                <div className="flex gap-1.5">
                  <Button
                    size="xs"
                    tone="default"
                    onClick={() => app.openDetails(r.id)}
                  >
                    Details
                  </Button>
                  <Button
                    size="xs"
                    tone="primary"
                    onClick={() => {
                      app.setSearchQuery('');
                      app.openCreate({
                        jobCardId: r.id,
                        bayId: '',
                        startMinutes: 9 * 60 + 30,
                        mode: 'create',
                      });
                    }}
                  >
                    Schedule
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
