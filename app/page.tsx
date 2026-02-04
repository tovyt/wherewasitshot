"use client";

import { useEffect, useMemo, useState } from "react";
import { buildStaticMapUrl } from "../lib/mapbox";

type EstimateResponse = {
  title: string;
  timestamp: string;
  isPlaceholder: boolean;
  estimateId?: number;
  estimate: {
    lat: number;
    lng: number;
    w3w: string | null;
    confidence: "low" | "medium" | "high";
    status?: "estimated" | "confirmed" | "rejected";
    score?: number;
  };
  evidence: { label: string; detail: string }[];
};

type FilmSuggestion = {
  title: string;
  wikipedia_title?: string;
};

type UserInfo = {
  id: number;
  handle: string;
  reputation: number;
};

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EstimateResponse | null>(null);
  const [suggestions, setSuggestions] = useState<FilmSuggestion[]>([]);
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newLat, setNewLat] = useState("");
  const [newLng, setNewLng] = useState("");
  const [newW3w, setNewW3w] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        setUser(data.user ?? null);
      } catch {
        setUser(null);
      }
    };

    loadUser();
  }, []);

  const mapUrl = useMemo(() => {
    if (!result || !mapboxToken) {
      return null;
    }
    return buildStaticMapUrl({
      lat: result.estimate.lat,
      lng: result.estimate.lng,
      token: mapboxToken
    });
  }, [mapboxToken, result]);

  useEffect(() => {
    if (title.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await fetch(`/api/films?q=${encodeURIComponent(title)}`, {
          signal: controller.signal
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        setSuggestions(data.items ?? []);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          return;
        }
      }
    };

    run();
    return () => controller.abort();
  }, [title]);

  const fetchEstimate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setRatingMessage(null);
    setRatingError(null);

    try {
      const response = await fetch(
        `/api/estimate?title=${encodeURIComponent(title)}&timestamp=${encodeURIComponent(timestamp)}`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to fetch estimate.");
      }
      const data = (await response.json()) as EstimateResponse;
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchEstimate();
  };

  const submitEstimate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitMessage(null);
    setSubmitError(null);

    if (!user) {
      setSubmitError("Please log in before submitting an estimate.");
      setSubmitting(false);
      return;
    }

    if (!title.trim() || !timestamp.trim()) {
      setSubmitError("Enter a film title and timestamp first.");
      setSubmitting(false);
      return;
    }

    const lat = Number(newLat);
    const lng = Number(newLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setSubmitError("Latitude and longitude must be valid numbers.");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          timestamp,
          lat,
          lng,
          w3w: newW3w.trim() || null,
          evidence: [
            {
              source_type: "User submission",
              source_url: evidenceUrl.trim() || null,
              note: evidenceNote.trim() || null
            }
          ]
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to submit estimate.");
      }

      setSubmitMessage("Thanks! Your estimate was submitted.");
      await fetchEstimate();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitRating = async (score: number) => {
    if (!result?.estimateId) {
      return;
    }
    if (!user) {
      setRatingError("Please log in before rating.");
      return;
    }
    setRatingLoading(true);
    setRatingMessage(null);
    setRatingError(null);

    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateId: result.estimateId,
          score
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to submit rating.");
      }

      setRatingMessage("Thanks for rating!");
      await fetchEstimate();
    } catch (err) {
      setRatingError((err as Error).message);
    } finally {
      setRatingLoading(false);
    }
  };

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    setAuthLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to log in.");
      }
      await response.json();
      setAuthMessage("Check your email for a login link.");
      setEmailInput("");
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <main>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h1>Film Location Finder</h1>
            <p className="muted">
              Enter a film title and timestamp to get an estimated filming location with evidence.
            </p>
          </div>
          <div style={{ minWidth: "260px" }}>
            {user ? (
              <div>
                <p className="muted">Signed in as</p>
                <strong>{user.handle}</strong>
                <p className="muted">Reputation: {user.reputation}</p>
                <p className="muted">
                  <a href="/profile">View profile</a>
                </p>
                <button type="button" onClick={logout}>
                  Log out
                </button>
              </div>
            ) : (
              <form onSubmit={login}>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                />
                <button type="submit" disabled={authLoading}>
                  {authLoading ? "Sending..." : "Send login link"}
                </button>
                {authMessage && <p className="muted">{authMessage}</p>}
                {authError && <p className="muted">Error: {authError}</p>}
              </form>
            )}
          </div>
        </div>

        <form onSubmit={submit} className="grid">
          <div>
            <label htmlFor="title">Film title</label>
            <input
              id="title"
              placeholder="e.g. The Dark Knight"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.slice(0, 8).map((item) => (
                  <span
                    key={`${item.title}-${item.wikipedia_title ?? ""}`}
                    className="suggestion"
                    onClick={() => setTitle(item.title)}
                    role="button"
                    tabIndex={0}
                  >
                    {item.title}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="timestamp">Timestamp</label>
            <input
              id="timestamp"
              placeholder="HH:MM:SS"
              value={timestamp}
              onChange={(event) => setTimestamp(event.target.value)}
            />
          </div>

          <div>
            <button type="submit" disabled={loading}>
              {loading ? "Estimating..." : "Find location"}
            </button>
            {error && <p className="muted">Error: {error}</p>}
          </div>
        </form>

        {result && (
          <section style={{ marginTop: "24px" }}>
            <div className="pill">Confidence: {result.estimate.confidence}</div>
            {result.isPlaceholder && <div className="pill">Placeholder result</div>}
            <h2 style={{ marginTop: "12px" }}>{result.title}</h2>
            <p className="muted">Timestamp: {result.timestamp}</p>

            <div className="grid" style={{ marginTop: "16px" }}>
              <div className="map">
                {mapUrl ? (
                  <img src={mapUrl} alt="Map preview" />
                ) : (
                  "Map preview requires a Mapbox token"
                )}
              </div>
              <div className="evidence">
                <p>
                  <strong>Estimated coordinates:</strong> {result.estimate.lat.toFixed(4)},{" "}
                  {result.estimate.lng.toFixed(4)}
                </p>
                <p>
                  <strong>what3words:</strong> {result.estimate.w3w ?? "Not available"}
                </p>
                <p className="muted" style={{ marginTop: "8px" }}>
                  Evidence
                </p>
                <ul>
                  {result.evidence.map((item, index) => (
                    <li key={`${item.label}-${index}`}>
                      <strong>{item.label}:</strong> {item.detail}
                    </li>
                  ))}
                </ul>
                {typeof result.estimate.score === "number" && (
                  <p className="muted" style={{ marginTop: "8px" }}>
                    Rating score: {result.estimate.score}
                  </p>
                )}
                <div style={{ marginTop: "12px" }}>
                  <button
                    type="button"
                    disabled={ratingLoading}
                    onClick={() => submitRating(1)}
                    style={{ marginRight: "8px" }}
                  >
                    Accurate
                  </button>
                  <button type="button" disabled={ratingLoading} onClick={() => submitRating(-1)}>
                    Inaccurate
                  </button>
                  {ratingMessage && <p className="muted">{ratingMessage}</p>}
                  {ratingError && <p className="muted">Error: {ratingError}</p>}
                </div>
              </div>
            </div>
          </section>
        )}

        <section style={{ marginTop: "24px" }}>
          <h2>Contribute an estimate</h2>
          <p className="muted">
            If no estimate exists (or you have better info), add a location for this timestamp.
          </p>
          <form onSubmit={submitEstimate} className="grid" style={{ marginTop: "12px" }}>
            <div>
              <label htmlFor="lat">Latitude</label>
              <input
                id="lat"
                placeholder="e.g. 34.0522"
                value={newLat}
                onChange={(event) => setNewLat(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="lng">Longitude</label>
              <input
                id="lng"
                placeholder="e.g. -118.2437"
                value={newLng}
                onChange={(event) => setNewLng(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="w3w">what3words (optional)</label>
              <input
                id="w3w"
                placeholder="e.g. index.home.raft"
                value={newW3w}
                onChange={(event) => setNewW3w(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="evidenceNote">Evidence note</label>
              <input
                id="evidenceNote"
                placeholder="Briefly explain why this location is correct"
                value={evidenceNote}
                onChange={(event) => setEvidenceNote(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="evidenceUrl">Evidence URL (optional)</label>
              <input
                id="evidenceUrl"
                placeholder="https://example.com/source"
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
              />
            </div>
            <div>
              <button type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit estimate"}
              </button>
              {submitMessage && <p className="muted">{submitMessage}</p>}
              {submitError && <p className="muted">Error: {submitError}</p>}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
