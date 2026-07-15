"use client";

import { useEffect, useState } from "react";
import { PageSkeleton } from "../components/Skeletons";
import { fetchJson, type QualityCheck } from "../lib/api";

export function QualityPage() {
  const [checks, setChecks] = useState<QualityCheck[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchJson<{ checks: QualityCheck[] }>("/api/lending/quality")
      .then((response) => setChecks(response.checks))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <PageSkeleton rows={7} />;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Quality</p>
          <h1>Data health monitor</h1>
        </div>
      </header>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th>Check</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.id}>
                  <td>{check.marketId}</td>
                  <td>{check.checkName}</td>
                  <td>
                    <span className={`status ${check.status}`}>{check.status}</span>
                  </td>
                  <td>{check.severity}</td>
                  <td>{check.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
