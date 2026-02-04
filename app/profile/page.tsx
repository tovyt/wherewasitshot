"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ProfileResponse = {
  user: {
    id: number;
    handle: string;
    reputation: number;
    created_at: string;
  };
  stats: {
    estimate_count: number;
    confirmed_count: number;
    rejected_count: number;
    pending_count: number;
    avg_score: number;
    ratings_count: number;
  };
  estimates: {
    id: number;
    film_title: string;
    status: string;
    score: number;
    created_at: string;
    confirmed_at: string | null;
    timestamp_start: number;
    timestamp_end: number;
  }[];
  ratings: {
    id: number;
    film_title: string;
    score: number;
    weight: number;
    comment: string | null;
    created_at: string;
    status: string;
    timestamp_start: number;
    timestamp_end: number;
  }[];
  reputation_events: {
    id: number;
    film_title: string;
    confirmed_at: string;
    timestamp_start: number;
    timestamp_end: number;
  }[];
};

function formatSeconds(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatRange(start: number, end: number) {
  return `${formatSeconds(start)}–${formatSeconds(end)}`;
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/profile");
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error ?? "Failed to load profile.");
        }
        const body = (await response.json()) as ProfileResponse;
        setData(body);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <main>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h1>Profile</h1>
            <p className="muted">See your contributions and reputation history.</p>
          </div>
          <div>
            <Link href="/">← Back to search</Link>
          </div>
        </div>

        {loading && <p className="muted">Loading profile...</p>}
        {error && (
          <div className="evidence" style={{ marginTop: "16px" }}>
            <p className="muted">Error: {error}</p>
            <p className="muted">Log in on the homepage to access your profile.</p>
          </div>
        )}

        {data && (
          <>
            <section style={{ marginTop: "16px" }}>
              <h2>{data.user.handle}</h2>
              <p className="muted">Reputation: {data.user.reputation}</p>
              <p className="muted">Member since: {new Date(data.user.created_at).toDateString()}</p>
            </section>

            <section style={{ marginTop: "16px" }}>
              <h2>Stats</h2>
              <div className="grid">
                <div className="evidence">
                  <strong>Estimates submitted</strong>
                  <p>{data.stats.estimate_count}</p>
                </div>
                <div className="evidence">
                  <strong>Confirmed estimates</strong>
                  <p>{data.stats.confirmed_count}</p>
                </div>
                <div className="evidence">
                  <strong>Rejected estimates</strong>
                  <p>{data.stats.rejected_count}</p>
                </div>
                <div className="evidence">
                  <strong>Pending estimates</strong>
                  <p>{data.stats.pending_count}</p>
                </div>
                <div className="evidence">
                  <strong>Average score</strong>
                  <p>{data.stats.avg_score.toFixed(2)}</p>
                </div>
                <div className="evidence">
                  <strong>Ratings given</strong>
                  <p>{data.stats.ratings_count}</p>
                </div>
              </div>
            </section>

            <section style={{ marginTop: "16px" }}>
              <h2>Recent estimates</h2>
              {data.estimates.length === 0 ? (
                <p className="muted">No estimates submitted yet.</p>
              ) : (
                <ul>
                  {data.estimates.map((item) => (
                    <li key={`estimate-${item.id}`}>
                      <strong>{item.film_title}</strong> ({formatRange(item.timestamp_start, item.timestamp_end)}
                      ) — {item.status} — score {item.score}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={{ marginTop: "16px" }}>
              <h2>Recent ratings</h2>
              {data.ratings.length === 0 ? (
                <p className="muted">No ratings yet.</p>
              ) : (
                <ul>
                  {data.ratings.map((item) => (
                    <li key={`rating-${item.id}`}>
                      <strong>{item.film_title}</strong> ({formatRange(item.timestamp_start, item.timestamp_end)}
                      ) — vote {item.score} (weight {item.weight.toFixed(2)}) — status {item.status}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={{ marginTop: "16px" }}>
              <h2>Reputation history</h2>
              {data.reputation_events.length === 0 ? (
                <p className="muted">No confirmed estimates yet.</p>
              ) : (
                <ul>
                  {data.reputation_events.map((item) => (
                    <li key={`rep-${item.id}`}>
                      Confirmed: <strong>{item.film_title}</strong> (
                      {formatRange(item.timestamp_start, item.timestamp_end)}) on{" "}
                      {new Date(item.confirmed_at).toDateString()}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
